import { createPuck, createMallet, step as physicsStep, MALLET_RADIUS, TABLE_WIDTH, TABLE_LENGTH } from '../src/physics.js';
import { EventEmitter } from '../src/events.js';
import { GameStateMachine, State } from '../src/stateMachine.js';

const HALF = TABLE_LENGTH / 2;

const Y_BOUNDS = {
	p1: { min: MALLET_RADIUS, max: HALF },
	p2: { min: HALF, max: TABLE_LENGTH - MALLET_RADIUS },
};

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

export class GameSession {
	constructor({ p1, p2, pointLimit = 7 }) {
		this.players = { p1, p2 };
		this.pointLimit = pointLimit;
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
		this._wireEvents();
	}

	applyInput(player, { x, y, onTable }) {
		this.inputBuffer[player] = { x, y, onTable };
	}

	_wireEvents() {
		const push = (type) => (data) => this.pendingEvents.push({ type, ...data });
		this.emitter.on('puck:mallet_hit', push('puck:mallet_hit'));
		this.emitter.on('puck:wall_bounce', push('puck:wall_bounce'));
		this.emitter.on('puck:off_table', push('puck:off_table'));
		this.emitter.on('puck:goal', push('puck:goal'));
		this.emitter.on('goal:scored', push('goal:scored'));
		this.emitter.on('game:start', push('game:start'));
		this.emitter.on('match:end', push('match:end'));
		this.emitter.on('serve:assigned', push('serve:assigned'));
	}

	_setState(next) {
		this.stateMachine.state = next;
	}

	drainPendingEvents() {
		const drained = this.pendingEvents;
		this.pendingEvents = [];
		return drained;
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
