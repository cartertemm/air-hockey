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
import { on as onTouch, fingerCount } from './input/touch.js';
import { InputHandler } from './input/inputHandler.js';

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
		this.input = new InputHandler();

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
		// Raw touch drives continuous mallet position; InputHandler handles the rest.
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

		const ih = this.input;
		ih.bind('moveLeft',  { hold: ['arrowleft']  });
		ih.bind('moveRight', { hold: ['arrowright'] });
		ih.bind('moveUp',    { hold: ['arrowup']    });
		ih.bind('moveDown',  { hold: ['arrowdown']  });
		ih.bind('moveFast',  { hold: ['control']    });
		ih.bind('latchMallet', { press: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'] });
		ih.bind('pauseToggle', { tap: [{ fingerCount: 2, tapCount: 1 }] });
		ih.bind('forfeit',     { tap: [{ fingerCount: 2, tapCount: 2 }] });
		ih.bind('readScore',   { tap: [{ fingerCount: 3, tapCount: 1 }] });
		ih.on('pauseToggle', () => this.sm.state === State.PAUSED ? this.sm.resume() : this.sm.pause());
		ih.on('forfeit',   () => this.sm.requestForfeit());
		ih.on('readScore', () => this.sm.readScore());
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

		if (!this._keyboardLatch && this.input.wasTriggered('latchMallet')) {
			this._keyboardLatch = true;
			physicsState.mallets[localPlayer].onTable = true;
		}
		if (this._keyboardLatch) this._applyKeyboard(localPlayer, dt);

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
		const ih = this.input;
		const dx = (ih.wasTriggered('moveRight') ? 1 : 0) - (ih.wasTriggered('moveLeft') ? 1 : 0);
		const dy = (ih.wasTriggered('moveUp')    ? 1 : 0) - (ih.wasTriggered('moveDown') ? 1 : 0);
		if (dx === 0 && dy === 0) return;
		const speed = ih.wasTriggered('moveFast') ? MALLET_SPEED_FAST : MALLET_SPEED_BASE;
		const len = Math.hypot(dx, dy);
		const m = this.physicsState.mallets[player];
		const b = Y_BOUNDS[player];
		m.x = clamp(m.x + (dx / len) * speed * dt, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
		m.y = clamp(m.y + (dy / len) * speed * dt, b.min, b.max);
	}
}
