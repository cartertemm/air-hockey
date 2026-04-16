const DEFAULTS = {
	target: null,
	tapMaxDistance: 10,
	tapMaxDuration: 300,
	swipeMinDistance: 30,
	swipeMaxDuration: 500,
	multiTapWindow: 250,
	multiTapMaxDistance: 40,
	maxTapCount: 3,
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

let gestureStartTime = 0;
let gesturePeakFingerCount = 0;
const gestureFingers = new Map();

let pendingTap = null;

function emit(name, payload) {
	for (const fn of handlers[name]) fn(payload);
}

function resetGesture() {
	gestureStartTime = 0;
	gesturePeakFingerCount = 0;
	gestureFingers.clear();
}

function record(touch) {
	const now = performance.now();
	if (fingers.size === 0) {
		gestureFingers.clear();
		gesturePeakFingerCount = 0;
		gestureStartTime = now;
	}
	fingers.set(touch.identifier, {
		x: touch.clientX,
		y: touch.clientY,
		startX: touch.clientX,
		startY: touch.clientY,
		startTime: now,
	});
	gestureFingers.set(touch.identifier, {
		id: touch.identifier,
		startX: touch.clientX,
		startY: touch.clientY,
		endX: touch.clientX,
		endY: touch.clientY,
		startTime: now,
	});
	if (fingers.size > gesturePeakFingerCount) {
		gesturePeakFingerCount = fingers.size;
	}
}

function update(touch) {
	const f = fingers.get(touch.identifier);
	if (!f) return;
	f.x = touch.clientX;
	f.y = touch.clientY;
	const gf = gestureFingers.get(touch.identifier);
	if (gf) {
		gf.endX = touch.clientX;
		gf.endY = touch.clientY;
	}
}

function release(touch) {
	const f = fingers.get(touch.identifier);
	if (!f) return;
	const gf = gestureFingers.get(touch.identifier);
	if (gf) {
		gf.endX = touch.clientX;
		gf.endY = touch.clientY;
	}
	fingers.delete(touch.identifier);
}

function emitPendingTap() {
	if (!pendingTap) return;
	const { fingerCount, x, y, tapCount } = pendingTap;
	pendingTap = null;
	emit('tap', { fingerCount, tapCount, x, y });
}

function flushPendingTap() {
	if (!pendingTap) return;
	clearTimeout(pendingTap.timer);
	emitPendingTap();
}

function handleTapGesture({ fingerCount, x, y }) {
	if (pendingTap
		&& pendingTap.fingerCount === fingerCount
		&& Math.hypot(x - pendingTap.x, y - pendingTap.y) < options.multiTapMaxDistance) {
		clearTimeout(pendingTap.timer);
		pendingTap.tapCount += 1;
		pendingTap.x = x;
		pendingTap.y = y;
		if (pendingTap.tapCount >= options.maxTapCount) {
			emitPendingTap();
			return;
		}
		pendingTap.timer = setTimeout(emitPendingTap, options.multiTapWindow);
		return;
	}
	if (pendingTap) {
		clearTimeout(pendingTap.timer);
		emitPendingTap();
	}
	pendingTap = {
		fingerCount,
		x,
		y,
		tapCount: 1,
		timer: setTimeout(emitPendingTap, options.multiTapWindow),
	};
}

function evaluateGesture() {
	if (gestureFingers.size === 0) return;
	const participants = Array.from(gestureFingers.values());
	let sumStartX = 0, sumStartY = 0, sumEndX = 0, sumEndY = 0;
	for (const p of participants) {
		sumStartX += p.startX;
		sumStartY += p.startY;
		sumEndX += p.endX;
		sumEndY += p.endY;
	}
	const n = participants.length;
	const startCentroid = { x: sumStartX / n, y: sumStartY / n };
	const endCentroid = { x: sumEndX / n, y: sumEndY / n };
	const dx = endCentroid.x - startCentroid.x;
	const dy = endCentroid.y - startCentroid.y;
	const distance = Math.hypot(dx, dy);
	const duration = performance.now() - gestureStartTime;

	if (distance > options.swipeMinDistance && duration < options.swipeMaxDuration) {
		const direction = Math.abs(dx) > Math.abs(dy)
			? (dx > 0 ? 'right' : 'left')
			: (dy > 0 ? 'down' : 'up');
		flushPendingTap();
		emit('swipe', {
			direction,
			fingerCount: gesturePeakFingerCount,
			distance,
			duration,
		});
		return;
	}

	if (distance < options.tapMaxDistance && duration < options.tapMaxDuration) {
		handleTapGesture({
			fingerCount: gesturePeakFingerCount,
			x: endCentroid.x,
			y: endCentroid.y,
		});
	}
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
	if (fingers.size === 0) {
		evaluateGesture();
		resetGesture();
	}
}

export function initTouch(userOptions = {}) {
	options = { ...DEFAULTS, ...userOptions };
	const target = options.target ?? document.body;
	disposeTouch();

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

export function disposeTouch() {
	fingers.clear();
	resetGesture();
	if (pendingTap) {
		clearTimeout(pendingTap.timer);
		pendingTap = null;
	}
	if (!initialized || !boundTarget) return;
	boundTarget.removeEventListener('touchstart', onStart);
	boundTarget.removeEventListener('touchmove', onMove);
	boundTarget.removeEventListener('touchend', onEnd);
	boundTarget.removeEventListener('touchcancel', onEnd);
	boundTarget = null;
	initialized = false;
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
