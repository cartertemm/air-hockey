import { createTouch } from 'audiogame-utils/input';

let instance = null;

export function initTouch(options = {}) {
	disposeTouch();
	instance = createTouch(options);
}

export function disposeTouch() {
	instance?.dispose();
	instance = null;
}

export function getTouch() {
	return instance;
}

export function fingerCount() {
	return instance.fingerCount();
}

export function on(name, handler) {
	instance.on(name, handler);
}

export function off(name, handler) {
	instance.off(name, handler);
}
