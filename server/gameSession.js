import { createPuck, createMallet, step as physicsStep, MALLET_RADIUS, TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';
import { EventEmitter } from '../src/events.js';
import { GameStateMachine, State } from '../src/stateMachine.js';
import { gameStart, gameSnapshot, gameEnd } from '../network/protocol.js';

const COUNTDOWN_MS = 3000;
const GOAL_HOLD_MS = 2000;
const SERVE_DRIFT_MAX = 0.5;
const HALF = TABLE_LENGTH / 2;

const Y_BOUNDS = {
	p1: { min: MALLET_RADIUS, max: HALF },
	p2: { min: HALF, max: TABLE_LENGTH - MALLET_RADIUS },
};

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

function randomDrift() {
	return (Math.random() * 2 - 1) * SERVE_DRIFT_MAX;
}

export class GameSession {
	constructor({ p1, p2, pointLimit = 7, onEnd = null }) {
		this.players = { p1, p2 };
		this.pointLimit = pointLimit;
		this.onEnd = onEnd;
		this.physicsState = {
			puck: createPuck(),
			mallets: { p1: createMallet('p1'), p2: createMallet('p2') },
			lastTouchedBy: null,
		};
		this.inputBuffer = {
			p1: { x: this.physicsState.mallets.p1.x, y: this.physicsState.mallets.p1.y, onTable: false },
			p2: { x: this.physicsState.mallets.p2.x, y: this.physicsState.mallets.p2.y, onTable: false },
		};
		this.tickCount = 0;
		this.emitter = new EventEmitter();
		this.stateMachine = new GameStateMachine({ pointLimit: this.pointLimit }, this.emitter);
		this.pendingEvents = [];
		this.firstServer = null;
		this.simNow = 0;
		this._timers = [];
		this._interval = null;
		this._startTime = 0;
		this._wireEvents();
	}

	applyInput(player, { x, y, onTable }) {
		this.inputBuffer[player] = { x, y, onTable };
	}

	togglePause(role, byName) {
		const prev = this.stateMachine.state;
		if (prev === State.PLAYING) {
			this.stateMachine.pause();
			if (this.stateMachine.state === State.PAUSED) {
				this.pendingEvents.push({ type: 'game:paused', byPlayer: role, byName });
			}
		} else if (prev === State.PAUSED) {
			this.stateMachine.resume();
			if (this.stateMachine.state === State.PLAYING) {
				this.pendingEvents.push({ type: 'game:resumed', byPlayer: role, byName });
			}
		}
	}

	_wireEvents() {
		const push = (type) => (data) => this.pendingEvents.push({ type, ...(data ?? {}) });
		this.emitter.on('puck:mallet_hit', push('puck:mallet_hit'));
		this.emitter.on('puck:mallet_hit', ({ speed }) => this.stateMachine.handlePuckStruck(speed));
		this.emitter.on('puck:wall_bounce', push('puck:wall_bounce'));
		this.emitter.on('puck:goal', (data) => {
			const puckSpeed = Math.hypot(this.physicsState.puck.vx, this.physicsState.puck.vy);
			this.pendingEvents.push({ type: 'puck:goal', ...(data ?? {}), puckSpeed });
			this.stateMachine.handleGoal(data.scoredBy);
			if (this.stateMachine.state === State.MATCH_END) {
				this._scheduleMatchEnd();
				return;
			}
			this._scheduleBeginServe();
		});
		this.emitter.on('puck:off_table', (data) => {
			this.pendingEvents.push({ type: 'puck:off_table', ...(data ?? {}) });
			if (this.stateMachine.state !== State.PLAYING && this.stateMachine.state !== State.SERVE) return;
			this.stateMachine.servingPlayer = data.lastTouchedBy === 'p1' ? 'p2' : 'p1';
			this.stateMachine.state = State.OFF_TABLE;
			this._scheduleBeginServe();
		});
		this.emitter.on('goal:scored', (data) => {
			const puckSpeed = Math.hypot(this.physicsState.puck.vx, this.physicsState.puck.vy);
			this.pendingEvents.push({ type: 'goal:scored', ...(data ?? {}), puckSpeed });
		});
		this.emitter.on('game:start', push('game:start'));
		this.emitter.on('match:end', push('match:end'));
		this.emitter.on('serve:assigned', (data) => {
			this.pendingEvents.push({ type: 'serve:assigned', ...(data ?? {}) });
			this._placePuck(data.player);
		});
	}

	_setState(next) {
		this.stateMachine.state = next;
	}

	_placePuck(servingPlayer) {
		const puck = this.physicsState.puck;
		puck.x = TABLE_WIDTH / 2;
		puck.y = servingPlayer === 'p1' ? TABLE_LENGTH / 4 : (3 * TABLE_LENGTH) / 4;
		puck.vx = randomDrift();
		puck.vy = randomDrift();
		puck.omega = 0;
		puck.onTable = true;
	}

	_schedule(ms, fn) {
		this._timers.push({ at: this.simNow + ms, fn });
	}

	_scheduleBeginServe() {
		this._schedule(GOAL_HOLD_MS, () => this.stateMachine.beginServe());
	}

	_scheduleMatchEnd() {
		this._schedule(GOAL_HOLD_MS, () => {
			const winner = this.stateMachine.scores.p1.points > this.stateMachine.scores.p2.points ? 'p1' : 'p2';
			this.onEnd?.({
				winner,
				finalScore: {
					p1: this.stateMachine.scores.p1.points,
					p2: this.stateMachine.scores.p2.points,
				},
			});
		});
	}

	_pumpTimers() {
		while (true) {
			let ran = false;
			const due = this._timers
				.filter(timer => timer.at <= this.simNow)
				.sort((a, b) => a.at - b.at);
			if (due.length === 0) return;
			this._timers = this._timers.filter(timer => timer.at > this.simNow);
			for (const timer of due) {
				timer.fn();
				ran = true;
			}
			if (!ran) return;
		}
	}

	start({ now = 0, firstServer = null } = {}) {
		this.simNow = now;
		this._timers = [];
		this.firstServer = firstServer ?? (Math.random() < 0.5 ? 'p1' : 'p2');
		this.stateMachine.startCountdown(this.firstServer);
		for (const key of ['p1', 'p2']) {
			this.players[key].send(gameStart({ localPlayer: key, pointLimit: this.pointLimit }));
		}
		this.pendingEvents.push({ type: 'game:countdown', seconds: 3 });
		for (let seconds = 2; seconds >= 0; seconds--) {
			this._schedule(COUNTDOWN_MS - (seconds * 1000), () => {
				this.pendingEvents.push({ type: 'game:countdown', seconds });
				if (seconds === 0) this.stateMachine.beginServe();
			});
		}
	}

	advanceTo(ms) {
		this.simNow = ms;
		this._pumpTimers();
	}

	drainPendingEvents() {
		const drained = this.pendingEvents;
		this.pendingEvents = [];
		return drained;
	}

	makeSnapshot() {
		const { puck, mallets } = this.physicsState;
		return gameSnapshot({
			tick: this.tickCount,
			state: this.stateMachine.state,
			puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy, omega: puck.omega, onTable: puck.onTable },
			mallets: {
				p1: { x: mallets.p1.x, y: mallets.p1.y, vx: mallets.p1.vx, vy: mallets.p1.vy, onTable: mallets.p1.onTable },
				p2: { x: mallets.p2.x, y: mallets.p2.y, vx: mallets.p2.vx, vy: mallets.p2.vy, onTable: mallets.p2.onTable },
			},
			scores: {
				p1: { points: this.stateMachine.scores.p1.points },
				p2: { points: this.stateMachine.scores.p2.points },
			},
			servingPlayer: this.stateMachine.servingPlayer,
			events: this.drainPendingEvents(),
		});
	}

	broadcastIfDue() {
		if (this.tickCount === 0 || this.tickCount % 2 !== 0) return;
		const snapshot = this.makeSnapshot();
		this.players.p1.send(snapshot);
		this.players.p2.send(snapshot);
	}

	sendGameEnd({ winner, finalScore }) {
		const msg = gameEnd({ winner, finalScore });
		this.players.p1.send(msg);
		this.players.p2.send(msg);
	}

	startRealTimeLoop({ intervalMs = 1000 / 120 } = {}) {
		if (this._interval) return;
		this._startTime = Date.now() - this.simNow;
		this._interval = setInterval(() => {
			this.simNow = Date.now() - this._startTime;
			this._pumpTimers();
			this.tick(intervalMs / 1000);
			this.broadcastIfDue();
		}, intervalMs);
	}

	stopRealTimeLoop() {
		if (!this._interval) return;
		clearInterval(this._interval);
		this._interval = null;
	}

	tick(dt) {
		for (const player of ['p1', 'p2']) {
			const buf = this.inputBuffer[player];
			const mallet = this.physicsState.mallets[player];
			const prevX = mallet.x;
			const prevY = mallet.y;
			const b = Y_BOUNDS[player];
			mallet.x = clamp(buf.x, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
			mallet.y = clamp(buf.y, b.min, b.max);
			mallet.onTable = buf.onTable;
			if (dt > 0) {
				mallet.vx = (mallet.x - prevX) / dt;
				mallet.vy = (mallet.y - prevY) / dt;
			}
		}
		const s = this.stateMachine.state;
		if (s === State.PLAYING || s === State.SERVE) {
			physicsStep(this.physicsState, dt, this.emitter);
		}
		this.tickCount++;
	}
}
