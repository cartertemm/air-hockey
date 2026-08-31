import { createMouse } from 'audiogame-utils/input';

let instance = null;

export function initMouse() {
	disposeMouse();
	instance = createMouse();
}

export function disposeMouse() {
	instance?.dispose();
	instance = null;
}

export function on(name, handler) {
	instance.on(name, handler);
}

export function off(name, handler) {
	instance.off(name, handler);
}
