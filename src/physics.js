// All measurements in inches. Origin at southwest corner of table.
// X increases east (0–48), Y increases north (0–96).
// Player 1 defends south goal (Y=0), Player 2 defends north goal (Y=96).

export const TABLE_WIDTH = 48;
export const TABLE_LENGTH = 96;
export const GOAL_X_MIN = 18;
export const GOAL_X_MAX = 30;
export const PUCK_RADIUS = 2.5;
export const MALLET_RADIUS = 4;
export const MAX_PUCK_VELOCITY = 150;

const RESTITUTION_WALL = 0.90;
const RESTITUTION_MALLET = 0.85;
const AIR_LINEAR_FRICTION = 0.015;   // multiplicative decay per second
const AIR_ANGULAR_FRICTION = 0.10;   // multiplicative decay per second
const WALL_TANGENTIAL_FRICTION = 0.05;
const SPIN_TRANSFER = 0.15;          // spin → tangential velocity at wall
const SPIN_WALL_RETENTION = 0.80;    // spin retained after wall bounce
const SPIN_FROM_MALLET_HIT = 0.30;   // tangential mallet velocity → spin
const OFF_TABLE_MARGIN = 10;         // inches beyond table edge before off-table fires

export function createPuck(x = TABLE_WIDTH / 2, y = TABLE_LENGTH / 2) {
	return { x, y, vx: 0, vy: 0, omega: 0, onTable: true };
}

// owner: 'p1' | 'p2' — sets default Y position within that player's half.
// onTable defaults to false; the input layer sets it true when appropriate.
export function createMallet(owner) {
	return {
		x: TABLE_WIDTH / 2,
		y: owner === 'p1' ? 12 : 84,
		vx: 0,
		vy: 0,
		onTable: false,
	};
}

function clampVelocity(puck) {
	const speed = Math.hypot(puck.vx, puck.vy);
	if (speed > MAX_PUCK_VELOCITY) {
		const scale = MAX_PUCK_VELOCITY / speed;
		puck.vx *= scale;
		puck.vy *= scale;
	}
}

function resolveWalls(puck, emitter) {
	let bounced = false;

	// West wall (X = 0)
	if (puck.x - PUCK_RADIUS < 0) {
		puck.x = PUCK_RADIUS;
		puck.vx = Math.abs(puck.vx) * RESTITUTION_WALL;
		puck.vy *= (1 - WALL_TANGENTIAL_FRICTION);
		puck.vy += puck.omega * PUCK_RADIUS * SPIN_TRANSFER;
		puck.omega *= SPIN_WALL_RETENTION;
		bounced = true;
	}

	// East wall (X = TABLE_WIDTH)
	if (puck.x + PUCK_RADIUS > TABLE_WIDTH) {
		puck.x = TABLE_WIDTH - PUCK_RADIUS;
		puck.vx = -Math.abs(puck.vx) * RESTITUTION_WALL;
		puck.vy *= (1 - WALL_TANGENTIAL_FRICTION);
		puck.vy += puck.omega * PUCK_RADIUS * SPIN_TRANSFER;
		puck.omega *= SPIN_WALL_RETENTION;
		bounced = true;
	}

	// South wall (Y = 0), excluding goal slot
	if (puck.y - PUCK_RADIUS < 0 && (puck.x < GOAL_X_MIN || puck.x > GOAL_X_MAX)) {
		puck.y = PUCK_RADIUS;
		puck.vy = Math.abs(puck.vy) * RESTITUTION_WALL;
		puck.vx *= (1 - WALL_TANGENTIAL_FRICTION);
		puck.vx += puck.omega * PUCK_RADIUS * SPIN_TRANSFER;
		puck.omega *= SPIN_WALL_RETENTION;
		bounced = true;
	}

	// North wall (Y = TABLE_LENGTH), excluding goal slot
	if (puck.y + PUCK_RADIUS > TABLE_LENGTH && (puck.x < GOAL_X_MIN || puck.x > GOAL_X_MAX)) {
		puck.y = TABLE_LENGTH - PUCK_RADIUS;
		puck.vy = -Math.abs(puck.vy) * RESTITUTION_WALL;
		puck.vx *= (1 - WALL_TANGENTIAL_FRICTION);
		puck.vx += puck.omega * PUCK_RADIUS * SPIN_TRANSFER;
		puck.omega *= SPIN_WALL_RETENTION;
		bounced = true;
	}

	if (bounced) {
		clampVelocity(puck);
		emitter?.emit('puck:wall_bounce', {
			x: puck.x,
			y: puck.y,
			speed: Math.hypot(puck.vx, puck.vy),
		});
	}
}

function resolveMallet(puck, mallet, player, state, emitter) {
	const dx = puck.x - mallet.x;
	const dy = puck.y - mallet.y;
	const dist = Math.hypot(dx, dy);
	const minDist = PUCK_RADIUS + MALLET_RADIUS;

	if (dist >= minDist || dist === 0) return;

	// Collision normal: from mallet center toward puck center
	const nx = dx / dist;
	const ny = dy / dist;

	// Push puck out of mallet
	const overlap = minDist - dist;
	puck.x += nx * overlap;
	puck.y += ny * overlap;

	// Relative velocity of puck with respect to mallet
	const vrx = puck.vx - mallet.vx;
	const vry = puck.vy - mallet.vy;
	const vRelNormal = vrx * nx + vry * ny;

	// Only resolve if objects are approaching
	if (vRelNormal >= 0) return;

	// Mallet treated as infinite mass: all impulse goes to puck
	const impulse = -(1 + RESTITUTION_MALLET) * vRelNormal;
	puck.vx += impulse * nx;
	puck.vy += impulse * ny;

	// Tangential relative velocity imparts spin
	const vRelTangential = vrx * (-ny) + vry * nx;
	puck.omega += vRelTangential * SPIN_FROM_MALLET_HIT;

	clampVelocity(puck);
	state.lastTouchedBy = player;

	emitter?.emit('puck:mallet_hit', {
		x: puck.x,
		y: puck.y,
		speed: Math.hypot(puck.vx, puck.vy),
		spin: puck.omega,
		player,
	});
}

// Returns true if a goal was scored (puck removed from table).
function checkGoal(puck, emitter) {
	// Puck enters south goal → Player 2 scores
	if (puck.y - PUCK_RADIUS <= 0 && puck.x >= GOAL_X_MIN && puck.x <= GOAL_X_MAX) {
		puck.onTable = false;
		emitter?.emit('puck:goal', { scoredBy: 'p2' });
		return true;
	}
	// Puck enters north goal → Player 1 scores
	if (puck.y + PUCK_RADIUS >= TABLE_LENGTH && puck.x >= GOAL_X_MIN && puck.x <= GOAL_X_MAX) {
		puck.onTable = false;
		emitter?.emit('puck:goal', { scoredBy: 'p1' });
		return true;
	}
	return false;
}

// Returns true if puck is off the table (removed from play).
function checkOffTable(puck, state, emitter) {
	if (
		puck.x < -OFF_TABLE_MARGIN ||
		puck.x > TABLE_WIDTH + OFF_TABLE_MARGIN ||
		puck.y < -OFF_TABLE_MARGIN ||
		puck.y > TABLE_LENGTH + OFF_TABLE_MARGIN
	) {
		puck.onTable = false;
		emitter?.emit('puck:off_table', { lastTouchedBy: state.lastTouchedBy });
		return true;
	}
	return false;
}

// Advance physics by dt seconds.
// state: { puck, mallets: { p1, p2 }, lastTouchedBy }
// emitter: optional EventEmitter — receives physics-layer events.
export function step(state, dt, emitter = null) {
	const { puck, mallets } = state;

	if (!puck.onTable) return;

	// Integrate position
	puck.x += puck.vx * dt;
	puck.y += puck.vy * dt;

	// Apply air-cushion friction and spin decay
	puck.vx *= (1 - AIR_LINEAR_FRICTION * dt);
	puck.vy *= (1 - AIR_LINEAR_FRICTION * dt);
	puck.omega *= (1 - AIR_ANGULAR_FRICTION * dt);

	// Off-table check before wall resolution: a puck that has escaped the OFF_TABLE_MARGIN
	// boundary is gone — no wall bounce should pull it back.
	if (checkOffTable(puck, state, emitter)) return;

	// Mallet collisions before walls so a mallet-struck puck is wall-corrected in the same tick
	for (const [player, mallet] of Object.entries(mallets)) {
		if (mallet.onTable) resolveMallet(puck, mallet, player, state, emitter);
	}

	resolveWalls(puck, emitter);

	if (checkGoal(puck, emitter)) return;

	emitter?.emit('puck:moving', {
		x: puck.x,
		y: puck.y,
		vx: puck.vx,
		vy: puck.vy,
		omega: puck.omega,
	});

	for (const [player, mallet] of Object.entries(mallets)) {
		if (mallet.onTable) {
			emitter?.emit('mallet:moving', {
				player,
				x: mallet.x,
				y: mallet.y,
				vx: mallet.vx,
				vy: mallet.vy,
			});
		}
	}
}
