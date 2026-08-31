import { createKeyboard } from 'audiogame-utils/input';

const handlers = new Set();
let instance = null;

export function initKeyboard() {
	if (instance) return;
	instance = createKeyboard();
	for (const [name, handler] of handlers) instance.on(name, handler);
}

export function getKeyboard() {
	return instance;
}

export function isDown(key) {
	return instance?.isDown(key) ?? false;
}

export function on(eventName, handler) {
	handlers.add([eventName, handler]);
	instance?.on(eventName, handler);
}

export function off(eventName, handler) {
	for (const entry of handlers) {
		if (entry[0] === eventName && entry[1] === handler) handlers.delete(entry);
	}
	instance?.off(eventName, handler);
}
