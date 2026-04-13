import { describe, test, expect, beforeEach } from 'vitest';
import { initTouch, fingerCount, getFinger, on, off } from '../src/input/touch.js';

function makeTouch(id, x, y) {
	return { identifier: id, clientX: x, clientY: y };
}

function dispatchTouch(type, touches, changedTouches) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	event.touches = touches;
	event.changedTouches = changedTouches ?? touches;
	event.preventDefault = () => {};
	document.body.dispatchEvent(event);
}

describe('touch', () => {
	beforeEach(() => {
		initTouch();
	});

	test('fingerCount is 0 initially', () => {
		expect(fingerCount()).toBe(0);
	});

	test('fingerCount tracks touchstart and touchend', () => {
		dispatchTouch('touchstart', [makeTouch(1, 100, 100)]);
		expect(fingerCount()).toBe(1);
		dispatchTouch('touchstart', [makeTouch(1, 100, 100), makeTouch(2, 200, 200)]);
		expect(fingerCount()).toBe(2);
		dispatchTouch('touchend', [makeTouch(1, 100, 100)], [makeTouch(2, 200, 200)]);
		expect(fingerCount()).toBe(1);
	});

	test('getFinger returns finger position', () => {
		dispatchTouch('touchstart', [makeTouch(1, 50, 75)]);
		const f = getFinger(0);
		expect(f.x).toBe(50);
		expect(f.y).toBe(75);
		expect(f.id).toBe(1);
	});

	test('tap event fires for short, close-to-stationary touch', async () => {
		const taps = [];
		on('tap', e => taps.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 100, 100)]);
		await new Promise(r => setTimeout(r, 50));
		dispatchTouch('touchend', [], [makeTouch(1, 102, 101)]);
		expect(taps.length).toBe(1);
		expect(taps[0].x).toBe(102);
		expect(taps[0].y).toBe(101);
	});

	test('swipe right detected', async () => {
		const swipes = [];
		on('swipe', e => swipes.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 100, 100)]);
		await new Promise(r => setTimeout(r, 50));
		dispatchTouch('touchend', [], [makeTouch(1, 200, 105)]);
		expect(swipes.length).toBe(1);
		expect(swipes[0].direction).toBe('right');
	});

	test('swipe left detected', async () => {
		const swipes = [];
		on('swipe', e => swipes.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 200, 100)]);
		await new Promise(r => setTimeout(r, 50));
		dispatchTouch('touchend', [], [makeTouch(1, 100, 102)]);
		expect(swipes[0].direction).toBe('left');
	});

	test('swipe up detected', async () => {
		const swipes = [];
		on('swipe', e => swipes.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 100, 200)]);
		await new Promise(r => setTimeout(r, 50));
		dispatchTouch('touchend', [], [makeTouch(1, 102, 100)]);
		expect(swipes[0].direction).toBe('up');
	});

	test('swipe down detected', async () => {
		const swipes = [];
		on('swipe', e => swipes.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 100, 100)]);
		await new Promise(r => setTimeout(r, 50));
		dispatchTouch('touchend', [], [makeTouch(1, 102, 200)]);
		expect(swipes[0].direction).toBe('down');
	});

	test('init options override default thresholds', () => {
		initTouch({ swipeMinDistance: 5 });
		const swipes = [];
		on('swipe', e => swipes.push(e));
		dispatchTouch('touchstart', [makeTouch(1, 100, 100)]);
		dispatchTouch('touchend', [], [makeTouch(1, 108, 100)]);
		expect(swipes.length).toBe(1);
		expect(swipes[0].direction).toBe('right');
	});
});
