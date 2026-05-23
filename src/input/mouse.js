let buttonDown = false;
let pos = { x: 0, y: 0 };
const handlers = {
	mousedown: new Set(),
	mouseup:   new Set(),
	mousemove: new Set(),
};
let initialized = false;

function emit(name, payload) {
	for (const fn of handlers[name]) fn(payload);
}

function onMouseDown(event) {
	if (event.button !== 0) return;
	buttonDown = true;
	pos = { x: event.clientX, y: event.clientY };
	emit('mousedown', { x: pos.x, y: pos.y });
}

function onMouseUp(event) {
	if (event.button !== 0) return;
	buttonDown = false;
	pos = { x: event.clientX, y: event.clientY };
	emit('mouseup', { x: pos.x, y: pos.y });
}

function onMouseMove(event) {
	pos = { x: event.clientX, y: event.clientY };
	emit('mousemove', { x: pos.x, y: pos.y });
}

export function initMouse() {
	if (initialized) return;
	window.addEventListener('mousedown', onMouseDown);
	window.addEventListener('mouseup',   onMouseUp);
	window.addEventListener('mousemove', onMouseMove);
	initialized = true;
}

export function disposeMouse() {
	buttonDown = false;
	if (!initialized) return;
	window.removeEventListener('mousedown', onMouseDown);
	window.removeEventListener('mouseup',   onMouseUp);
	window.removeEventListener('mousemove', onMouseMove);
	initialized = false;
}

export function isButtonDown() {
	return buttonDown;
}

export function getPosition() {
	return { ...pos };
}

export function on(name, handler) {
	handlers[name]?.add(handler);
}

export function off(name, handler) {
	handlers[name]?.delete(handler);
}
