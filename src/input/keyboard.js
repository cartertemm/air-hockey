import { createKeyboard } from 'audiogame-utils/input';

let instance = null;

export function initKeyboard() {
	if (instance) return;
	instance = createKeyboard();
}

export function getKeyboard() {
	return instance;
}
