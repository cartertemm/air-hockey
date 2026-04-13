const pressed = new Set();
const handlers = {
	keydown: new Set(),
	keyup: new Set(),
	keypress: new Set(),
};
let initialized = false;

function emit(eventName, event) {
	for (const fn of handlers[eventName]) fn(event);
}

function onKeyDown(event) {
	const key = event.key.toLowerCase();
	pressed.add(key);
	emit('keydown', event);
	if (!event.repeat) emit('keypress', event);
}

function onKeyUp(event) {
	const key = event.key.toLowerCase();
	pressed.delete(key);
	emit('keyup', event);
}

export function initKeyboard() {
	if (initialized) return;
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	initialized = true;
}

export function isDown(key) {
	return pressed.has(key.toLowerCase());
}

export function on(eventName, handler) {
	handlers[eventName]?.add(handler);
}

export function off(eventName, handler) {
	handlers[eventName]?.delete(handler);
}
