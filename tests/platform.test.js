import { describe, test, expect, afterEach } from 'vitest';
import { isIOSStandalone } from '../src/platform.js';

describe('platform', () => {
	afterEach(() => {
		delete window.navigator.standalone;
	});

	test('returns true when navigator.standalone is true', () => {
		Object.defineProperty(window.navigator, 'standalone', {
			value: true,
			configurable: true,
		});
		expect(isIOSStandalone()).toBe(true);
	});

	test('returns false when navigator.standalone is undefined', () => {
		expect(isIOSStandalone()).toBe(false);
	});

	test('returns false when navigator.standalone is false', () => {
		Object.defineProperty(window.navigator, 'standalone', {
			value: false,
			configurable: true,
		});
		expect(isIOSStandalone()).toBe(false);
	});
});
