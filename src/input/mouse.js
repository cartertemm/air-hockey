import { createMouse } from 'audiogame-utils/input';

// Handlers are registered against this module rather than the instance, so
// they survive the init/dispose cycle that entering and leaving gameplay does.
const handlers = new Set();
let instance = null;

export function initMouse() {
	disposeMouse();
	instance = createMouse();
	for (const [name, handler] of handlers) instance.on(name, handler);
}

export function disposeMouse() {
	instance?.dispose();
	instance = null;
}

export function isButtonDown() {
	return instance?.isButtonDown() ?? false;
}

export function getPosition() {
	return instance?.getPosition() ?? { x: 0, y: 0 };
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
