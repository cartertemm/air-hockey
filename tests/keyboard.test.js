import { describe, test, expect, beforeEach } from 'vitest';
import { initKeyboard, isDown, on, off } from '../src/input/keyboard.js';

function dispatchKey(type, key, options = {}) {
	window.dispatchEvent(new KeyboardEvent(type, { key, ...options }));
}

describe('keyboard', () => {
	beforeEach(() => {
		initKeyboard();
	});

	test('isDown returns false before any key is pressed', () => {
		expect(isDown('a')).toBe(false);
	});

	test('isDown returns true after keydown', () => {
		dispatchKey('keydown', 'a');
		expect(isDown('a')).toBe(true);
	});

	test('isDown returns false after keyup', () => {
		dispatchKey('keydown', 'a');
		dispatchKey('keyup', 'a');
		expect(isDown('a')).toBe(false);
	});

	test('keys are normalized to lowercase', () => {
		dispatchKey('keydown', 'A');
		expect(isDown('a')).toBe(true);
		expect(isDown('A')).toBe(true);
	});

	test('arrow keys tracked', () => {
		dispatchKey('keydown', 'ArrowLeft');
		expect(isDown('arrowleft')).toBe(true);
	});

	test('on(keydown) handler fires on keydown', () => {
		const calls = [];
		on('keydown', e => calls.push(e.key));
		dispatchKey('keydown', 'b');
		expect(calls).toEqual(['b']);
	});

	test('on(keypress) fires once per non-repeat keydown', () => {
		const calls = [];
		on('keypress', e => calls.push(e.key));
		dispatchKey('keydown', 'c', { repeat: false });
		dispatchKey('keydown', 'c', { repeat: true });
		dispatchKey('keydown', 'c', { repeat: true });
		expect(calls).toEqual(['c']);
	});

	test('off removes a handler', () => {
		const calls = [];
		const handler = e => calls.push(e.key);
		on('keydown', handler);
		off('keydown', handler);
		dispatchKey('keydown', 'd');
		expect(calls).toEqual([]);
	});
});
