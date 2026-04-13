const DEFAULTS = {
	target: null,
	tapMaxDistance: 10,
	tapMaxDuration: 300,
	swipeMinDistance: 30,
	swipeMaxDuration: 500,
};

const fingers = new Map();
const handlers = {
	touchstart: new Set(),
	touchmove: new Set(),
	touchend: new Set(),
	tap: new Set(),
	swipe: new Set(),
};
let options = { ...DEFAULTS };
let initialized = false;
let boundTarget = null;

function emit(name, payload) {
	for (const fn of handlers[name]) fn(payload);
}

function record(touch) {
	const now = performance.now();
	fingers.set(touch.identifier, {
		x: touch.clientX,
		y: touch.clientY,
		startX: touch.clientX,
		startY: touch.clientY,
		startTime: now,
	});
}

function update(touch) {
	const f = fingers.get(touch.identifier);
	if (!f) return;
	f.x = touch.clientX;
	f.y = touch.clientY;
}

function release(touch) {
	const f = fingers.get(touch.identifier);
	if (!f) return;
	const endX = touch.clientX;
	const endY = touch.clientY;
	const dx = endX - f.startX;
	const dy = endY - f.startY;
	const distance = Math.hypot(dx, dy);
	const duration = performance.now() - f.startTime;

	if (distance > options.swipeMinDistance && duration < options.swipeMaxDuration) {
		const direction = Math.abs(dx) > Math.abs(dy)
			? (dx > 0 ? 'right' : 'left')
			: (dy > 0 ? 'down' : 'up');
		emit('swipe', { direction, distance, duration });
	} else if (distance < options.tapMaxDistance && duration < options.tapMaxDuration) {
		emit('tap', { x: endX, y: endY });
	}

	fingers.delete(touch.identifier);
}

function onStart(event) {
	event.preventDefault?.();
	for (const t of event.changedTouches) record(t);
	emit('touchstart', event);
}

function onMove(event) {
	event.preventDefault?.();
	for (const t of event.changedTouches) update(t);
	emit('touchmove', event);
}

function onEnd(event) {
	event.preventDefault?.();
	for (const t of event.changedTouches) release(t);
	emit('touchend', event);
}

export function initTouch(userOptions = {}) {
	options = { ...DEFAULTS, ...userOptions };
	const target = options.target ?? document.body;

	if (initialized && boundTarget === target) return;
	if (initialized) {
		boundTarget.removeEventListener('touchstart', onStart);
		boundTarget.removeEventListener('touchmove', onMove);
		boundTarget.removeEventListener('touchend', onEnd);
		boundTarget.removeEventListener('touchcancel', onEnd);
	}

	target.addEventListener('touchstart', onStart, { passive: false });
	target.addEventListener('touchmove', onMove, { passive: false });
	target.addEventListener('touchend', onEnd, { passive: false });
	target.addEventListener('touchcancel', onEnd, { passive: false });
	boundTarget = target;
	initialized = true;
}

export function fingerCount() {
	return fingers.size;
}

export function getFinger(index) {
	const arr = getAllFingers();
	return arr[index] ?? null;
}

export function getAllFingers() {
	return Array.from(fingers.entries()).map(([id, f]) => ({ id, x: f.x, y: f.y }));
}

export function on(name, handler) {
	handlers[name]?.add(handler);
}

export function off(name, handler) {
	handlers[name]?.delete(handler);
}
