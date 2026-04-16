import { describe, test, expect } from 'vitest';
import { malletHitTier, wallBounceTier, goalTier } from '../src/audio/tiers.js';

describe('audio tiers', () => {
	test('malletHitTier maps speed to 1|2|3', () => {
		expect(malletHitTier(120)).toBe(1);
		expect(malletHitTier(60)).toBe(2);
		expect(malletHitTier(10)).toBe(3);
		expect(malletHitTier(90)).toBe(2);
		expect(malletHitTier(91)).toBe(1);
	});

	test('wallBounceTier maps speed to hard|soft', () => {
		expect(wallBounceTier(100)).toBe('hard');
		expect(wallBounceTier(60)).toBe('soft');
		expect(wallBounceTier(61)).toBe('hard');
	});

	test('goalTier maps speed to 1..5', () => {
		expect(goalTier(140)).toBe(1);
		expect(goalTier(100)).toBe(2);
		expect(goalTier(70)).toBe(3);
		expect(goalTier(40)).toBe(4);
		expect(goalTier(10)).toBe(5);
	});
});
