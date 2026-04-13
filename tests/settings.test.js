import { describe, test, expect } from 'vitest';
import { get, set, remove } from '../src/settings.js';

describe('settings', () => {
	test('set then get returns the same value', () => {
		set('theme', 'dark');
		expect(get('theme')).toBe('dark');
	});

	test('get returns default when key is missing', () => {
		expect(get('missing', 'fallback')).toBe('fallback');
	});

	test('non-string types round-trip', () => {
		set('count', 42);
		set('flag', true);
		set('obj', { a: 1, b: [2, 3] });
		expect(get('count')).toBe(42);
		expect(get('flag')).toBe(true);
		expect(get('obj')).toEqual({ a: 1, b: [2, 3] });
	});

	test('remove deletes a key', () => {
		set('temp', 'value');
		remove('temp');
		expect(get('temp', null)).toBe(null);
	});

	test('keys are namespaced under airhockey:', () => {
		set('foo', 'bar');
		expect(localStorage.getItem('airhockey:foo')).toBe('"bar"');
	});
});
