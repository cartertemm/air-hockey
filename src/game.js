import { EventEmitter } from './events.js';
import { createGameClient } from './net/gameClient.js';
import {
	TABLE_WIDTH,
	TABLE_LENGTH,
	MALLET_RADIUS,
} from './physics.js';
import { on as onTouch, off as offTouch, fingerCount } from './input/touch.js';
import { InputHandler } from './input/inputHandler.js';

const HALF = TABLE_LENGTH / 2;
const MALLET_SPEED_BASE = 24;
const MALLET_SPEED_FAST = 48;

const Y_BOUNDS = {
	p1: { min: MALLET_RADIUS, max: HALF },
	p2: { min: HALF, max: TABLE_LENGTH - MALLET_RADIUS },
};

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

export function screenToTable(screenX, screenY, player, screenW, screenH) {
	const rx = screenX / screenW;
	const ry = screenY / screenH;
	if (player === 'p1') return { x: rx * TABLE_WIDTH, y: HALF * (1 - ry) };
	return { x: (1 - rx) * TABLE_WIDTH, y: HALF + ry * HALF };
}

export class Game {
	constructor({ socket, input = null } = {}) {
		this.emitter = new EventEmitter();
		this.client = createGameClient({ socket });
		this.input = input ?? new InputHandler();
		this.localPlayer = null;
		this.snapshot = null;
		this._keyboardLatch = false;
		this._fingerId = null;
		this._local = { x: TABLE_WIDTH / 2, y: 12, onTable: false };
		this._touchHandlers = [];
		this._wireClient();
		this._wireInput();
	}

	on(event, handler) {
		this.emitter.on(event, handler);
		return () => this.emitter.off(event, handler);
	}

	_wireClient() {
		this.client.on('gameStart', (msg) => {
			this.localPlayer = msg.localPlayer;
			this._local.y = msg.localPlayer === 'p1' ? 12 : TABLE_LENGTH - 12;
			this.emitter.emit('gameStart', msg);
		});
		this.client.on('snapshot', (msg) => {
			for (const event of msg.events ?? []) this.emitter.emit('event', event);
			this.snapshot = msg;
			this.emitter.emit('snapshot', msg);
		});
		this.client.on('gameEnd', (msg) => this.emitter.emit('gameEnd', msg));
	}

	_wireInput() {
		const onStart = (event) => {
			if (this._fingerId !== null) return;
			const touch = event.changedTouches[0];
			if (!touch) return;
			if (fingerCount() !== 1) return;
			this._fingerId = touch.identifier;
			this._applyTouch(touch.clientX, touch.clientY);
			this._local.onTable = true;
			this._sendCurrent();
		};
		const onMove = (event) => {
			if (this._fingerId === null) return;
			for (const touch of event.changedTouches) {
				if (touch.identifier !== this._fingerId) continue;
				this._applyTouch(touch.clientX, touch.clientY);
				this._sendCurrent();
				break;
			}
		};
		const onEnd = (event) => {
			if (this._fingerId === null) return;
			for (const touch of event.changedTouches) {
				if (touch.identifier !== this._fingerId) continue;
				this._fingerId = null;
				if (!this._keyboardLatch) this._local.onTable = false;
				this._sendCurrent();
				break;
			}
		};
		onTouch('touchstart', onStart);
		onTouch('touchmove', onMove);
		onTouch('touchend', onEnd);
		this._touchHandlers.push(['touchstart', onStart], ['touchmove', onMove], ['touchend', onEnd]);
		const ih = this.input;
		ih.bind('moveLeft', { hold: ['arrowleft'] });
		ih.bind('moveRight', { hold: ['arrowright'] });
		ih.bind('moveUp', { hold: ['arrowup'] });
		ih.bind('moveDown', { hold: ['arrowdown'] });
		ih.bind('moveFast', { hold: ['control'] });
		ih.bind('latchMallet', { press: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'] });
	}

	_applyTouch(screenX, screenY) {
		if (!this.localPlayer) return;
		const pos = screenToTable(screenX, screenY, this.localPlayer, window.innerWidth, window.innerHeight);
		const bounds = Y_BOUNDS[this.localPlayer];
		this._local.x = clamp(pos.x, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
		this._local.y = clamp(pos.y, bounds.min, bounds.max);
	}

	tick(dt) {
		if (!this.localPlayer) return;
		if (!this._keyboardLatch && this.input.wasTriggered('latchMallet')) {
			this._keyboardLatch = true;
			this._local.onTable = true;
		}
		if (!this._keyboardLatch) return;
		const ih = this.input;
		const dx = (ih.wasTriggered('moveRight') ? 1 : 0) - (ih.wasTriggered('moveLeft') ? 1 : 0);
		const dy = (ih.wasTriggered('moveUp') ? 1 : 0) - (ih.wasTriggered('moveDown') ? 1 : 0);
		if (dx === 0 && dy === 0) return;
		const speed = ih.wasTriggered('moveFast') ? MALLET_SPEED_FAST : MALLET_SPEED_BASE;
		const len = Math.hypot(dx, dy);
		const bounds = Y_BOUNDS[this.localPlayer];
		this._local.x = clamp(this._local.x + (dx / len) * speed * dt, MALLET_RADIUS, TABLE_WIDTH - MALLET_RADIUS);
		this._local.y = clamp(this._local.y + (dy / len) * speed * dt, bounds.min, bounds.max);
		this._sendCurrent();
	}

	_sendCurrent() {
		this.client.sendInput({ x: this._local.x, y: this._local.y, onTable: this._local.onTable });
	}

	dispose() {
		for (const [eventName, handler] of this._touchHandlers) {
			offTouch(eventName, handler);
		}
		this._touchHandlers = [];
	}
}
