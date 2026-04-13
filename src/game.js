// Client-side game coordinator.
// Owns the physics state, state machine, and local input wiring.
// Network-agnostic: the remote player's mallet is updated via setRemoteMallet().

import { EventEmitter } from './events.js';
import { GameStateMachine, State } from './stateMachine.js';
import {
	step,
	createPuck,
	createMallet,
	TABLE_WIDTH,
	TABLE_LENGTH,
	MALLET_RADIUS,
} from './physics.js';
import { isDown, on as onKey } from './input/keyboard.js';
import { on as onTouch, fingerCount } from './input/touch.js';

const PHYSICS_DT        = 1 / 120;  // seconds per tick
const MALLET_SPEED_BASE = 24;        // in/s
const MALLET_SPEED_FAST = 48;        // in/s (Ctrl held)
const SERVE_DRIFT_MAX   = 0.5;       // in/s — max random drift on puck placement
const MAX_DT            = PHYSICS_DT * 3; // cap to prevent spiral of death

const HALF = TABLE_LENGTH / 2; // 48 — center line Y

// Y constraints for each player's mallet center
const Y_BOUNDS = {
	p1: { min: MALLET_RADIUS,            max: HALF },
	p2: { min: HALF,                     max: TABLE_LENGTH - MALLET_RADIUS },
};

// Serve positions (puck center)
const SERVE_POS = {
	p1: { x: TABLE_WIDTH / 2, y: 12 },
	p2: { x: TABLE_WIDTH / 2, y: TABLE_LENGTH - 12 },
};

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

function randomDrift() {
	return (Math.random() * 2 - 1) * SERVE_DRIFT_MAX;
}

// Map raw screen coordinates to table coordinates for a given player.
// screenW / screenH are passed explicitly so this function is testable in Node.
//
// Player 1 perspective: bottom of screen = near their goal (Y=0), top = center (Y=48).
// Player 2 perspective: bottom of screen = near their goal (Y=96), top = center (Y=48).
// Player 2's X axis is mirrored so their left is table-left from their point of view.
export function screenToTable(screenX, screenY, player, screenW, screenH) {
	const rx = screenX / screenW;
	const ry = screenY / screenH;
	if (player === 'p1') {
		return {
			x: rx * TABLE_WIDTH,
			y: HALF * (1 - ry),
		};
	}
	return {
		x: (1 - rx) * TABLE_WIDTH,
		y: HALF + ry * HALF,
	};
}

export class Game {
	// localPlayer: 'p1' | 'p2' — which player this device controls via touch / keyboard.
	constructor({ localPlayer = 'p1', pointLimit = 7, bestOf = 1 } = {}) {
		this.localPlayer = localPlayer;

		this.emitter = new EventEmitter();
		this.sm = new GameStateMachine({ pointLimit, bestOf }, this.emitter);

		this.physicsState = {
			puck: createPuck(),
			mallets: {
				p1: createMallet('p1'),
				p2: createMallet('p2'),
			},
			lastTouchedBy: null,
		};

		this._tickInterval   = null;
		this._lastTickTime   = 0;
		this._malletFingerId = null;  // touch identifier driving the local mallet
		this._keyboardLatch  = false; // once true, mallet stays on table permanently

		// Track previous mallet position each tick for velocity derivation
		const m = this.physicsState.mallets[localPlayer];
		this._prevMalletX = m.x;
		this._prevMalletY = m.y;

		this._wireSMEvents();
		this._wireInput();
	}

	// ── State machine ↔ physics wiring ─────────────────────────────────────────

	_wireSMEvents() {
		const { emitter: em, sm } = this;

		em.on('puck:goal',       ({ scoredBy })      => sm.handleGoal(scoredBy));
		em.on('puck:off_table',  ({ lastTouchedBy })  => sm.handleOffTable(lastTouchedBy));
		em.on('puck:mallet_hit', ({ speed })          => sm.handlePuckStruck(speed));

		// Place the puck as soon as a serve is assigned — it's live immediately.
		em.on('serve:assigned', ({ player }) => this._placePuck(player));
	}

	// ── Input wiring ────────────────────────────────────────────────────────────

	_wireInput() {
		// ── Touch: 1-finger mallet control ──────────────────────────────────────

		onTouch('touchstart', (event) => {
			// Only track a finger if none is already driving the mallet
			// and this is the only finger currently on screen.
			if (this._malletFingerId !== null) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			if (fingerCount() !== 1) return;

			this._malletFingerId = touch.identifier;
			this._applyTouchPosition(touch.clientX, touch.clientY);
			this.physicsState.mallets[this.localPlayer].onTable = true;
		});

		onTouch('touchmove', (event) => {
			if (this._malletFingerId === null) return;
			for (const t of event.changedTouches) {
				if (t.identifier === this._malletFingerId) {
					this._applyTouchPosition(t.clientX, t.clientY);
					break;
				}
			}
		});

		onTouch('touchend', (event) => {
			if (this._malletFingerId === null) return;
			for (const t of event.changedTouches) {
				if (t.identifier === this._malletFingerId) {
					this._malletFingerId = null;
					// Keyboard-latched players keep their mallet on the table.
					if (!this._keyboardLatch) {
						this.physicsState.mallets[this.localPlayer].onTable = false;
					}
					break;
				}
			}
		});

		// ── Gestures → state machine ────────────────────────────────────────────

		onTouch('tap', (event) => {
			const { fingerCount: fingers, tapCount } = event;
			if (fingers === 2 && tapCount === 1) {
				if (this.sm.state === State.PAUSED) this.sm.resume();
				else this.sm.pause();
			} else if (fingers === 2 && tapCount === 2) {
				this.sm.requestForfeit();
			} else if (fingers === 3 && tapCount === 1) {
				this.sm.readScore();
			}
		});

		// ── Keyboard: latch mallet on first arrow key ───────────────────────────

		onKey('keydown', (event) => {
			const arrows = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
			if (!this._keyboardLatch && arrows.includes(event.key.toLowerCase())) {
				this._keyboardLatch = true;
				this.physicsState.mallets[this.localPlayer].onTable = true;
			}
		});
	}

	_applyTouchPosition(screenX, screenY) {
		const mallet = this.physicsState.mallets[this.localPlayer];
		const { x, y } = screenToTable(
			screenX, screenY,
			this.localPlayer,
			window.innerWidth, window.innerHeight,
		);
		const b = Y_BOUNDS[this.localPlayer];
		mallet.x = clamp(x, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
		mallet.y = clamp(y, b.min, b.max);
	}

	// ── Puck placement ──────────────────────────────────────────────────────────

	_placePuck(servingPlayer) {
		const pos = SERVE_POS[servingPlayer];
		const puck = this.physicsState.puck;
		puck.x     = pos.x;
		puck.y     = pos.y;
		puck.vx    = randomDrift();
		puck.vy    = randomDrift();
		puck.omega = 0;
		puck.onTable = true;
	}

	// ── Remote mallet (called by network layer) ─────────────────────────────────

	setRemoteMallet(x, y, vx, vy, onTable) {
		const remote = this.localPlayer === 'p1' ? 'p2' : 'p1';
		const m = this.physicsState.mallets[remote];
		m.x = x;
		m.y = y;
		m.vx = vx;
		m.vy = vy;
		m.onTable = onTable;
	}

	getLocalMallet() {
		return { ...this.physicsState.mallets[this.localPlayer] };
	}

	// ── Physics loop ────────────────────────────────────────────────────────────

	start() {
		if (this._tickInterval !== null) return;
		this._lastTickTime = performance.now();
		this._tickInterval = setInterval(() => this._tick(), PHYSICS_DT * 1000);
	}

	stop() {
		if (this._tickInterval === null) return;
		clearInterval(this._tickInterval);
		this._tickInterval = null;
	}

	_tick() {
		const now = performance.now();
		const dt  = Math.min((now - this._lastTickTime) / 1000, MAX_DT);
		this._lastTickTime = now;

		const { sm, physicsState, emitter, localPlayer } = this;

		// Apply keyboard movement to local mallet
		if (this._keyboardLatch) {
			this._applyKeyboard(localPlayer, dt);
		}

		// Derive mallet velocity from position delta for collision response.
		// Works uniformly for both touch (position set by events) and keyboard
		// (position updated above).
		const m = physicsState.mallets[localPlayer];
		if (dt > 0) {
			m.vx = (m.x - this._prevMalletX) / dt;
			m.vy = (m.y - this._prevMalletY) / dt;
		}
		this._prevMalletX = m.x;
		this._prevMalletY = m.y;

		// Run physics only during active states
		if (sm.state === State.PLAYING || sm.state === State.SERVE) {
			step(physicsState, dt, emitter);
		}
	}

	// Updates local mallet position based on currently held arrow keys.
	// Exported separately for unit testing.
	_applyKeyboard(player, dt) {
		let dx = 0, dy = 0;
		if (isDown('arrowleft'))  dx -= 1;
		if (isDown('arrowright')) dx += 1;
		if (isDown('arrowup'))    dy += 1;
		if (isDown('arrowdown'))  dy -= 1;

		if (dx === 0 && dy === 0) return;

		const speed = isDown('control') ? MALLET_SPEED_FAST : MALLET_SPEED_BASE;
		const len   = Math.hypot(dx, dy);
		const moveX = (dx / len) * speed * dt;
		const moveY = (dy / len) * speed * dt;

		const m = this.physicsState.mallets[player];
		const b = Y_BOUNDS[player];
		m.x = clamp(m.x + moveX, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
		m.y = clamp(m.y + moveY, b.min, b.max);
	}
}
