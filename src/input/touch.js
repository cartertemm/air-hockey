import { createTouch } from 'audiogame-utils/input';

const handlers = new Set();
let instance = null;

export function initTouch(options = {}) {
	disposeTouch();
	instance = createTouch(options);
	for (const [name, handler] of handlers) instance.on(name, handler);
}

export function disposeTouch() {
	instance?.dispose();
	instance = null;
}

export function getTouch() {
	return instance;
}

export function fingerCount() {
	return instance?.fingerCount() ?? 0;
}

export function on(name, handler) {
	handlers.add([name, handler]);
	instance?.on(name, handler);
}

export function off(name, handler) {
	for (const entry of handlers) {
		if (entry[0] === name && entry[1] === handler) handlers.delete(entry);
	}
	instance?.off(name, handler);
}
