# Air Hockey Game — Gameplay & Physics Design Spec

## 1. Overview

This document covers the gameplay and physics layer of an accessible, multiplayer, server-authoritative air hockey game running on Node.js (server) with a Vite-based web client. The physics engine is custom-built. Sound, networking, input event handling, and window rendering are handled by a separate infrastructure layer.

---

## 2. Coordinate System & Table Dimensions

All measurements are in **inches**. The canonical table mirrors a standard 8ft × 4ft tournament air hockey table.

| Dimension | Value |
|---|---|
| Table length (Y axis) | 96 inches |
| Table width (X axis) | 48 inches |
| Goal slot width | 12 inches |
| Goal slot center | X = 24 |
| Goal slot span | X = 18 to X = 30 |
| Puck radius | 2.5 inches |
| Mallet radius | 4 inches |

**Axis orientation:**
- Origin `(0, 0)` is the **southwest corner** of the table (Player 1's back-left corner).
- **X** increases east (left wall → right wall).
- **Y** increases north (Player 1's end → Player 2's end).
- Player 1 defends the **south goal** at `Y = 0`.
- Player 2 defends the **north goal** at `Y = 96`.
- Center line at `Y = 48`.

**Walls:**
```
North wall:  Y = 96,  X = [0, 18] and X = [30, 48]  (goal slot gap at X = 18–30)
South wall:  Y = 0,   X = [0, 18] and X = [30, 48]  (goal slot gap at X = 18–30)
East wall:   X = 48,  Y = [0, 96]
West wall:   X = 0,   Y = [0, 96]
```

**Goal pockets** extend 4 inches beyond the wall (for positional audio purposes — the puck has somewhere to travel after scoring):
- South pocket: Y = -4 to Y = 0, X = 18 to 30
- North pocket: Y = 96 to Y = 100, X = 18 to 30

---

## 3. Game Objects

### 3.1 Puck

```js
{
  x: number,          // center X position (inches)
  y: number,          // center Y position (inches)
  vx: number,         // velocity X (inches/second)
  vy: number,         // velocity Y (inches/second)
  omega: number,      // angular velocity (radians/second, for audio/spin)
  radius: 2.5,        // inches (constant)
  mass: 0.035,        // kg (standard puck ~35g)
  onTable: boolean,   // false when in goal pocket or off table
}
```

**Physical constants:**
| Parameter | Value | Notes |
|---|---|---|
| Restitution (wall) | 0.90 | Highly elastic bounce |
| Restitution (mallet) | 0.85 | Slightly less elastic |
| Air-on linear friction | 0.015 /s | Multiplicative drag per second |
| Air-on angular friction | 0.10 /s | Spin decay per second |
| Max velocity | 150 in/s | Hard cap — prevents tunneling and extreme shots |

### 3.2 Mallet

Each player has one mallet. Mallets are **kinematic** — their position is driven by player input, not by force integration. The server tracks velocity for collision response.

```js
{
  x: number,          // center X position (inches)
  y: number,          // center Y position (inches)
  vx: number,         // velocity X this tick (inches/second) — derived from input delta
  vy: number,         // velocity Y this tick (inches/second) — derived from input delta
  radius: 4,          // inches (constant)
  onTable: boolean,   // false when touch player has no finger down
  owner: 'p1' | 'p2',
}
```

**Mallet movement constraints:**
- Must remain within table X bounds: `[mallet.radius, 48 - mallet.radius]`
- Player 1 mallet restricted to `Y ∈ [mallet.radius, 48]` (south half)
- Player 2 mallet restricted to `Y ∈ [48, 96 - mallet.radius]` (north half)
- Mallets cannot push each other (they do not collide with each other, only with the puck)

### 3.3 Table (Static)

The table itself has no dynamic state. It is represented as a set of line segments used for collision detection:

```js
const walls = [
  // South wall (two segments around goal slot)
  { x1: 0,  y1: 0,  x2: 18, y2: 0 },
  { x1: 30, y1: 0,  x2: 48, y2: 0 },
  // North wall
  { x1: 0,  y1: 96, x2: 18, y2: 96 },
  { x1: 30, y1: 96, x2: 48, y2: 96 },
  // East wall
  { x1: 48, y1: 0,  x2: 48, y2: 96 },
  // West wall
  { x1: 0,  y1: 0,  x2: 0,  y2: 96 },
];
```

---

## 4. Physics Simulation

### 4.1 Simulation Loop

The server runs a **fixed-timestep physics loop at 120 Hz** (dt = 8.33ms). This rate is chosen to prevent tunneling without requiring sub-step CCD at the maximum puck velocity (150 in/s × 0.00833s = 1.25 inches per tick, safely below the puck radius of 2.5 inches).

Each tick:
1. Read pending input from both clients
2. Update mallet positions (kinematic)
3. Integrate puck velocity and position
4. Detect and resolve all collisions
5. Apply friction and drag
6. Check win/off-table/goal conditions
7. Broadcast game state snapshot to clients

### 4.2 Puck Integration

```
puck.x += puck.vx * dt
puck.y += puck.vy * dt
puck.omega *= (1 - AIR_ANGULAR_FRICTION * dt)

// Linear drag (air cushion)
puck.vx *= (1 - AIR_LINEAR_FRICTION * dt)
puck.vy *= (1 - AIR_LINEAR_FRICTION * dt)

// Velocity cap
const speed = Math.hypot(puck.vx, puck.vy)
if (speed > MAX_VELOCITY) {
  puck.vx = (puck.vx / speed) * MAX_VELOCITY
  puck.vy = (puck.vy / speed) * MAX_VELOCITY
}
```

### 4.3 Puck–Wall Collision

For each wall segment, test if the puck's circle intersects. Since all walls are axis-aligned, this simplifies to:

**Horizontal wall (south/north):**
```
penetration = puck.radius - |puck.y - wall.y|
if (penetration > 0):
  puck.y += penetration * sign(puck.y - wall.y)   // push out
  puck.vy *= -RESTITUTION_WALL                     // reflect normal component
  puck.vx *= (1 - WALL_TANGENTIAL_FRICTION)        // tangential friction
  // Spin exchange: fast-spinning puck adds a small tangential kick
  puck.vx += puck.omega * puck.radius * SPIN_TRANSFER * sign(puck.vy_before)
  puck.omega *= SPIN_WALL_RETENTION                // some spin retained
```

**Vertical wall (east/west):** same logic, swap x/y roles.

`WALL_TANGENTIAL_FRICTION = 0.05` — walls are nearly frictionless.  
`SPIN_TRANSFER = 0.15` — light effect; spin adds some "english" to bounces.  
`SPIN_WALL_RETENTION = 0.80` — most spin survives a wall bounce.

### 4.4 Puck–Mallet Collision

Only tested when `mallet.onTable === true`.

```
dx = puck.x - mallet.x
dy = puck.y - mallet.y
dist = Math.hypot(dx, dy)
minDist = puck.radius + mallet.radius   // 6.5 inches

if (dist < minDist && dist > 0):
  // Collision normal (puck relative to mallet)
  nx = dx / dist
  ny = dy / dist

  // Separate circles
  overlap = minDist - dist
  puck.x += nx * overlap
  puck.y += ny * overlap

  // Relative velocity at contact
  vrx = puck.vx - mallet.vx
  vry = puck.vy - mallet.vy
  vRelNormal = vrx * nx + vry * ny

  // Only resolve if approaching
  if (vRelNormal < 0):
    impulse = -(1 + RESTITUTION_MALLET) * vRelNormal
    // Mallet is kinematic (effectively infinite mass), so all impulse goes to puck
    puck.vx += impulse * nx
    puck.vy += impulse * ny

    // Impart spin based on tangential component of relative velocity
    vRelTangential = vrx * (-ny) + vry * nx
    puck.omega += vRelTangential * SPIN_FROM_MALLET_HIT

    // Re-apply velocity cap
    clampPuckVelocity()
```

`SPIN_FROM_MALLET_HIT = 0.3` — tangential mallet contact imparts meaningful spin.

### 4.5 Goal Detection

Each tick, after integration and collision resolution:

```
// Player 2 scores (puck enters south goal)
if (puck.y - puck.radius <= 0 && puck.x >= 18 && puck.x <= 30):
  triggerGoal('p2')

// Player 1 scores (puck enters north goal)
if (puck.y + puck.radius >= 96 && puck.x >= 18 && puck.x <= 30):
  triggerGoal('p1')
```

### 4.6 Off-Table Detection

```
if (puck.x < -puck.radius || puck.x > 48 + puck.radius ||
    puck.y < -10 || puck.y > 106):
  triggerOffTable(lastPlayerToTouchPuck)
```

`lastPlayerToTouchPuck` is tracked each time a puck–mallet collision is resolved. The **opponent** of the last player to touch it is awarded the serve.

---

## 5. Input Handling & Mallet Control

### 5.1 Touch Input (Phone/Tablet)

The player's screen represents **their half of the table** (a 48 × 48 inch square). Touch coordinates are mapped linearly:

```
// Player 1 (south half, Y = 0 to 48)
tableX = (touchX / screenWidth) * 48
tableY = 48 - (touchY / screenHeight) * 48
// touchY=0 (top of screen) → tableY=48 (center line)
// touchY=screenH (bottom of screen) → tableY=0 (player's goal end)

// Player 2 (north half, Y = 48 to 96) — screen is mirrored
tableX = 48 - (touchX / screenWidth) * 48
tableY = 48 + (touchY / screenHeight) * 48
// touchY=0 (top of screen) → tableY=96 (player's goal end)
// touchY=screenH (bottom of screen) → tableY=48 (center line)
```

Player 2's X axis is mirrored so that both players experience the table from their own perspective (their goal at the bottom).

**Finger down:** mallet appears at mapped table position.  
**Finger drag:** mallet follows finger position each tick. Mallet velocity is computed from position delta:
```
mallet.vx = (newTableX - mallet.x) / dt
mallet.vy = (newTableY - mallet.y) / dt
```
**Finger up:** `mallet.onTable = false`. Mallet is removed from physics.

Mallet position is clamped to the player's legal half after each update.

### 5.2 Touch Gestures (Non-gameplay)

| Gesture | Action |
|---|---|
| 1 finger down/drag | Mallet control |
| 2 finger single tap | Pause / Resume |
| 2 finger double tap | Forfeit (triggers confirmation prompt) |
| 3 finger tap | Read current score aloud |

### 5.3 Keyboard Input (Desktop / Phone with keyboard)

Keyboard players have their mallet **always on the table**. No appear/disappear.

| Key | Action |
|---|---|
| Arrow keys | Move mallet |
| Ctrl + Arrow keys | Move mallet at 2× speed |
| Arrow key released | Instant stop |

**Mallet speed:**
- Base: `24 in/s`
- With Ctrl: `48 in/s`

Diagonal movement is normalized so speed is consistent in all directions:
```
if (left && up): direction = normalize(-1, 1) * speed
```

Keyboard mallet velocity for collision purposes is derived from position delta each tick, same as touch.

---

## 6. Game State Machine

```
LOBBY
  → COUNTDOWN (both players ready)

COUNTDOWN (3–2–1, air turns on)
  → PLAYING

PLAYING
  → GOAL (puck enters goal)
  → OFF_TABLE (puck leaves table boundary)
  → PAUSED (2-finger tap)
  → FORFEIT_CONFIRM (2-finger double tap)

GOAL
  → SERVE (score announced, serving player assigned)

OFF_TABLE
  → SERVE (wasted shot announced, opponent assigned serve)

SERVE (serving player's puck is live, waiting for first strike)
  → PLAYING (puck velocity exceeds threshold after mallet contact)

PAUSED
  → PLAYING (2-finger tap to resume)
  → FORFEIT_CONFIRM (2-finger double tap)

FORFEIT_CONFIRM
  → MATCH_END (confirmed)
  → PAUSED (denied / timeout)

PLAYING → MATCH_END (score limit reached)

MATCH_END
  → LOBBY (rematch / new game)
```

---

## 7. Match Structure & Rules

### 7.1 Game Modes

| Mode | Description |
|---|---|
| Single Match | First to reach the point limit wins |
| Best of 3 | First player to win 2 games wins the match |

### 7.2 Point Limits (selectable)

- **7 points** (standard competitive)
- **11 points** (casual / extended)

### 7.3 Serving Rules

- **Match start:** serve goes to the player who lost the coin flip (random).
- **After a goal:** the player who was scored on serves.
- **After puck off table:** the opponent of the player who last touched the puck serves.
- **Serve mechanics:** the server places the puck on the serving player's half at a default position (`X=24, Y=12` for P1, `X=24, Y=84` for P2) with near-zero velocity plus a tiny random drift (`|v| < 0.5 in/s` in a random direction). The puck is live immediately. The SERVE state ends when any mallet–puck collision is detected (the puck has been struck).

### 7.4 Puck Off Table

- Announced via speech: *"Puck off table. [Opponent name] to serve."*
- No point is awarded or deducted.
- Counts as wasted shot — opponent gets a free serve.

---

## 8. Network State Snapshot

The server broadcasts the following payload every tick (or every 2 ticks at 60fps if bandwidth is a concern). Format is left to the network layer; these are the required fields:

```js
{
  tick: number,
  gameState: GameStateEnum,
  puck: { x, y, vx, vy, omega, onTable },
  mallets: {
    p1: { x, y, onTable },
    p2: { x, y, onTable },
  },
  scores: {
    p1: { games: number, points: number },
    p2: { games: number, points: number },
  },
  servingPlayer: 'p1' | 'p2' | null,
  lastEventMessage: string | null,   // speech string for audio layer
}
```

Client sends each tick (or on change):
```js
{
  tick: number,
  input: {
    // Touch player
    fingerDown: boolean,
    fingerX: number,    // raw screen X
    fingerY: number,    // raw screen Y
    // Keyboard player
    keys: { up, down, left, right, ctrl }  // booleans
  }
}
```

---

## 9. Audio Integration Points

The physics layer must emit the following events for the audio/speech layer to consume. These are fired as named events on each tick where they occur:

| Event | Data | Purpose |
|---|---|---|
| `puck:wall_bounce` | `{ x, y, speed, angle }` | Positional bounce SFX |
| `puck:mallet_hit` | `{ x, y, speed, spin, player }` | Positional hit SFX |
| `puck:moving` | `{ x, y, vx, vy, omega }` | Continuous positional audio (puck slide/spin) |
| `mallet:moving` | `{ player, x, y, vx, vy }` | Continuous positional audio (mallet slide) |
| `puck:off_table` | `{ lastTouchedBy }` | Speech + SFX trigger |
| `goal:scored` | `{ scoredBy, p1Points, p2Points }` | Speech + SFX trigger |
| `game:start` | `{ servingPlayer }` | Speech + SFX trigger |
| `game:end` | `{ winner, p1Points, p2Points }` | Speech + SFX trigger |
| `match:end` | `{ winner, p1Games, p2Games }` | Speech + SFX trigger |
| `serve:assigned` | `{ player }` | Speech trigger |
| `player:joined` | `{ player, name }` | Speech trigger |
| `player:left` | `{ player, name }` | Speech trigger |
| `game:paused` | — | Speech + SFX trigger |
| `game:resumed` | — | Speech + SFX trigger |
| `forfeit:confirmed` | `{ player }` | Speech + SFX trigger |
| `score:readout` | `{ p1Points, p2Points }` | Speech trigger (gesture) |

---

## 10. Constants Summary

```js
// Table
TABLE_WIDTH  = 48        // inches
TABLE_LENGTH = 96        // inches
GOAL_WIDTH   = 12        // inches
GOAL_X_MIN   = 18        // inches
GOAL_X_MAX   = 30        // inches

// Objects
PUCK_RADIUS   = 2.5      // inches
PUCK_MASS     = 0.035    // kg
MALLET_RADIUS = 4        // inches

// Physics
RESTITUTION_WALL    = 0.90
RESTITUTION_MALLET  = 0.85
AIR_LINEAR_FRICTION = 0.015   // per second (multiplicative)
AIR_ANGULAR_FRICTION= 0.10    // per second (multiplicative)
WALL_TANGENTIAL_FRICTION = 0.05
SPIN_TRANSFER       = 0.15    // spin → linear at wall bounce
SPIN_WALL_RETENTION = 0.80    // spin retained after wall bounce
SPIN_FROM_MALLET_HIT= 0.30    // tangential mallet velocity → spin
MAX_PUCK_VELOCITY   = 150     // inches/second
PHYSICS_HZ          = 120     // ticks per second
PHYSICS_DT          = 1/120   // seconds per tick

// Keyboard mallet
MALLET_SPEED_BASE   = 24      // inches/second
MALLET_SPEED_FAST   = 48      // inches/second (Ctrl held)

// Serve
SERVE_POS_P1 = { x: 24, y: 12 }
SERVE_POS_P2 = { x: 24, y: 84 }
SERVE_DRIFT_MAX = 0.5         // inches/second max random drift
SERVE_END_THRESHOLD = 5       // inches/second — puck speed after mallet hit ends SERVE state
```

---

## 11. Open Questions / Future Considerations

- **Puck corner collisions:** corners where two walls meet (and wall segments meet the goal slot edges) need special handling. Recommend treating goal-slot edges as short vertical wall segments of zero thickness with a rounded corner (4-inch radius arc) to avoid the puck getting stuck.
- **Mallet–mallet interaction:** currently undefined. Mallets cannot collide with each other per the spec. If both players reach the center line simultaneously, their mallets may overlap visually — this is acceptable since each is constrained to their own half.
- **Latency compensation:** client-side prediction is not in scope per this spec (server-authoritative, network layer handled separately). If latency becomes an issue, mallet interpolation on the client side is the first mitigation to add.
- **Spectator mode:** not specified — the same state snapshot format supports observers trivially.
