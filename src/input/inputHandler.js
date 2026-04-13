import * as keyboard from './keyboard.js';
import * as touch from './touch.js';

export class InputHandler {
	#bindings = new Map();
	#handlers = new Map();
	#pending = new Set();
	#attached = false;
	#keyPressHandler = null;
	#tapHandler = null;
	#swipeHandler = null;

	constructor(options = {}) {
		const shouldAttach = options.attach !== false;
		if (shouldAttach) this.attach();
	}

	get attached() {
		return this.#attached;
	}

	bind(name, binding) {
		this.#bindings.set(name, {
			hold: binding.hold ?? [],
			press: binding.press ?? [],
			tap: binding.tap ?? [],
			swipe: binding.swipe ?? [],
		});
	}

	unbind(name) {
		this.#bindings.delete(name);
		this.#handlers.delete(name);
		this.#pending.delete(name);
	}

	wasTriggered(name) {
		if (!this.#attached) return false;
		const b = this.#bindings.get(name);
		if (!b) return false;
		if (this.#pending.has(name)) {
			this.#pending.delete(name);
			return true;
		}
		for (const key of b.hold) {
			if (keyboard.isDown(key)) return true;
		}
		return false;
	}

	on(name, handler) {
		if (!this.#handlers.has(name)) this.#handlers.set(name, new Set());
		this.#handlers.get(name).add(handler);
	}

	off(name, handler) {
		this.#handlers.get(name)?.delete(handler);
	}

	describe(name) {
		if (name !== undefined) {
			const b = this.#bindings.get(name);
			return b ? this.#serialize(name, b) : null;
		}
		const out = [];
		for (const [n, b] of this.#bindings) out.push(this.#serialize(n, b));
		return out;
	}

	attach() {
		if (this.#attached) return;
		this.#keyPressHandler = event => this.#handleKeyPress(event);
		this.#tapHandler = event => this.#handleTap(event);
		this.#swipeHandler = event => this.#handleSwipe(event);
		keyboard.on('keypress', this.#keyPressHandler);
		touch.on('tap', this.#tapHandler);
		touch.on('swipe', this.#swipeHandler);
		this.#attached = true;
	}

	detach() {
		if (!this.#attached) return;
		keyboard.off('keypress', this.#keyPressHandler);
		touch.off('tap', this.#tapHandler);
		touch.off('swipe', this.#swipeHandler);
		this.#keyPressHandler = null;
		this.#tapHandler = null;
		this.#swipeHandler = null;
		this.#attached = false;
	}

	#handleKeyPress(event) {
		const key = event.key.toLowerCase();
		for (const [name, b] of this.#bindings) {
			if (b.press.includes(key)) this.#fire(name);
		}
	}

	#handleTap(event) {
		for (const [name, b] of this.#bindings) {
			for (const spec of b.tap) {
				if (this.#matchesSpec(event, spec)) {
					this.#fire(name);
					break;
				}
			}
		}
	}

	#handleSwipe(event) {
		for (const [name, b] of this.#bindings) {
			for (const spec of b.swipe) {
				if (this.#matchesSpec(event, spec)) {
					this.#fire(name);
					break;
				}
			}
		}
	}

	#matchesSpec(event, spec) {
		for (const key of Object.keys(spec)) {
			if (event[key] !== spec[key]) return false;
		}
		return true;
	}

	#fire(name) {
		this.#pending.add(name);
		const handlers = this.#handlers.get(name);
		if (!handlers) return;
		for (const h of handlers) h({ name });
	}

	#serialize(name, b) {
		const bindings = [];
		for (const key of b.hold) bindings.push({ kind: 'hold', key });
		for (const key of b.press) bindings.push({ kind: 'press', key });
		for (const spec of b.tap) bindings.push({ kind: 'tap', ...spec });
		for (const spec of b.swipe) bindings.push({ kind: 'swipe', ...spec });
		return { name, bindings };
	}
}

export function formatBinding(binding) {
	switch (binding.kind) {
		case 'hold':
		case 'press':
			return formatKey(binding.key);
		case 'tap':
			return formatTap(binding);
		case 'swipe':
			return formatSwipe(binding);
		default:
			return '';
	}
}

const SPECIAL_KEYS = {
	' ': 'Space',
	'arrowleft': 'Arrow Left',
	'arrowright': 'Arrow Right',
	'arrowup': 'Arrow Up',
	'arrowdown': 'Arrow Down',
	'escape': 'Escape',
	'enter': 'Enter',
	'tab': 'Tab',
	'shift': 'Shift',
	'control': 'Control',
	'alt': 'Alt',
	'meta': 'Meta',
	'backspace': 'Backspace',
};

function formatKey(key) {
	if (key === undefined || key === null || key === '') return '';
	if (SPECIAL_KEYS[key] !== undefined) return SPECIAL_KEYS[key];
	if (key.length === 1) return key.toUpperCase();
	return key[0].toUpperCase() + key.slice(1);
}

const FINGER_WORDS = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };

function fingerPrefix(n) {
	if (!n || n <= 1) return '';
	const word = FINGER_WORDS[n] ?? String(n);
	return `${word} finger `;
}

function tapCountWord(n) {
	if (!n || n === 1) return 'Tap';
	if (n === 2) return 'Double tap';
	if (n === 3) return 'Triple tap';
	return `${n}-tap`;
}

function formatTap(binding) {
	const prefix = fingerPrefix(binding.fingerCount);
	const base = tapCountWord(binding.tapCount);
	if (!prefix) return base;
	return `${prefix}${base.toLowerCase()}`;
}

function formatSwipe(binding) {
	const prefix = fingerPrefix(binding.fingerCount);
	const dir = binding.direction ?? '';
	if (!prefix) {
		return `Swipe ${dir}`.trimEnd();
	}
	return `${prefix}swipe ${dir}`.trimEnd();
}
