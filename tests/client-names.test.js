import { describe, test, expect } from 'vitest';
import { generateName } from '../src/names.js';

describe('generateName', () => {
	test('returns a two-word space-separated string', () => {
		const name = generateName();
		expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
	});

	test('draws from a list of plausible size (at least 16 unique outputs across 200 calls)', () => {
		const seen = new Set();
		for (let i = 0; i < 200; i++) seen.add(generateName());
		expect(seen.size).toBeGreaterThanOrEqual(16);
	});
});
