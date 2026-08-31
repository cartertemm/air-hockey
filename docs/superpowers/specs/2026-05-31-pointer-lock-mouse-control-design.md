# Pointer-Lock Mouse Control — Design

**Date:** 2026-05-31
**Status:** Approved (pending spec review)

## Problem

The recently added mouse control uses **absolute** positioning: a screen position
maps directly to a table position via `screenToTable`, with listeners on `window`
(`src/input/mouse.js`, `src/game.js`). While the left button is held, the mallet
tracks the cursor.

For a blind player this is fragile: dragging the mouse easily carries the OS cursor
out of the browser window (onto other apps or the desktop), at which point mouse
events stop arriving and there is no visible cursor to bring back. The browser
offers no way to confine a *visible* cursor — the only API that confines the
pointer is **Pointer Lock**.

## Goal

A blind player can no longer drag the cursor out of the window. The cursor is
confined by Pointer Lock, control becomes relative (delta-based), and
engaging/re-engaging control never requires aiming a click — it is the **M** key.

## Decisions (settled during brainstorming)

- **Control model:** Relative movement via Pointer Lock. Mouse motion nudges the
  mallet by `movementX`/`movementY` deltas. This replaces the absolute
  position-maps-to-table model for the mouse.
- **Engagement model:** Lock the pointer **once** (engaged by a key, re-engageable
  by a key, so aiming a click is never required). The pointer stays confined for
  the whole session. Holding the **left mouse button** puts the mallet on the
  table; releasing lifts it off — preserving today's "hold the mallet down" feel.
- **Engage key:** **M** (mnemonic for "mouse"). Toggles the lock with spoken
  confirmation.
- **Lock element:** `document.body` (the game is audio-only with no canvas; touch
  already binds to `document.body`).

## Behavior

- **M** toggles mouse control:
  - Engaging calls `requestPointerLock()` on `document.body`. The browser hides
    and confines the cursor and switches mouse events to relative deltas.
    Speech: *"Mouse control on."*
  - Pressing **M** again (or the browser's Escape) exits the lock.
    Speech: *"Mouse control off. Press M to re-enable."*
- While locked:
  - **Moving the mouse** nudges the mallet by deltas (accumulated into the local
    mallet position, then clamped to the player's half).
  - **Holding the left button** = mallet on the table; **releasing** lifts it off.
- **Lock loss** (Escape, Alt-Tab, tab switch, window blur — all browser-driven)
  fires `pointerlockchange`. The game announces the re-enable cue and lifts the
  mouse-driven mallet off the table, so the player is never silently stranded.
  A keypress (**M**) re-locks; no clicking into the window is required.
- When **not** locked, mouse button/move events are ignored entirely, so a stray
  click outside the game (on the desktop) cannot latch the mallet.

## Components

### `src/input/mouse.js` (reworked)
- Wraps `requestPointerLock` / `exitPointerLock`.
- Requests use `{ unadjustedMovement: true }` (raw movement, no OS pointer
  acceleration — more predictable for accessibility) with graceful fallback when
  the option is unsupported, and tolerate both the `Promise` and legacy callback
  forms of `requestPointerLock` across browsers.
- Listens for `pointerlockchange` and `pointerlockerror` on `document`.
- Exposes `isLocked()` and a `lockchange` event (in addition to existing
  `on`/`off`).
- While locked, `mousemove` emits `{ dx, dy }` deltas (from `movementX`/
  `movementY`) instead of absolute `{ x, y }`. `mousedown` / `mouseup` for
  button 0 continue to emit for on/off-table control.
- `pointerlockerror` (e.g. re-lock attempted during the browser's post-Escape
  cooldown) is surfaced so `game.js` can announce a brief retry cue.

### `src/game.js`
- Replace the absolute `onMouseMove → _applyTouch(x, y)` path with
  `_applyMouseDelta(dx, dy)`: apply per-player mirroring and sensitivity, add to
  `_local.x` / `_local.y`, clamp to `MALLET_RADIUS..TABLE_WIDTH-MALLET_RADIUS`
  and the player's `Y_BOUNDS`.
- `mousedown` sets the mouse-driven `onTable` true; `mouseup` clears it unless the
  keyboard latch is active (existing `if (!this._keyboardLatch)` rule).
- Bind **M** (e.g. an input action `toggleMouse`) to request/exit the pointer lock
  on `document.body`. The keydown is the required user-activation gesture.
- Wire `lockchange` to the speech cues and to lifting the mouse-driven `onTable`
  when the lock is lost.
- Mouse button/move handlers no-op while the pointer is not locked.

### Speech
- All cues go through the existing `speak()`.

### Unchanged
- Touch input path.
- Keyboard control. Keyboard-latch and mouse-button on-table states continue to
  coexist exactly as today.

## Mirroring & sensitivity (concrete)

Matching the existing `screenToTable` orientation so mouse, touch, and keyboard
agree:

- **p1:** `x += dx · S`, `y += −dy · S` (mouse-up on screen = toward opponent = +y)
- **p2:** `x += −dx · S`, `y += +dy · S` (mirrored — same convention as the
  absolute mapping)

Where `S = MOUSE_SENSITIVITY`, a module-level constant. Default ≈ **0.06 in/px**
(~800 px of mouse travel crosses the full 48″ table width). Tuning lives in one
place. A user-facing sensitivity setting is intentionally **out of scope** (YAGNI)
unless requested later.

## Testing

- **`src/input/mouse.js`:** stub `requestPointerLock` and
  `document.pointerLockElement`; assert lock-state transitions, that `mousemove`
  emits deltas only while locked, and that the `lockchange` event fires on
  `pointerlockchange`.
- **`tests/game-input.test.js`:** the current mouse tests assert the *absolute*
  model and will be **rewritten** for the delta model:
  - engage lock → `mousedown` sets `onTable` → a `MouseEvent` with `movementX/Y`
    moves `_local` by the sensitivity factor → `mouseup` lifts off;
  - mouse events while unlocked do nothing;
  - **M** toggles the lock (with `requestPointerLock` mocked);
  - p2 mirroring;
  - lock-loss announces the cue and clears the mouse-driven `onTable`.

## Out of scope

- Touchpad/touch behavior changes.
- A sensitivity settings UI.
- Any change to keyboard control.
