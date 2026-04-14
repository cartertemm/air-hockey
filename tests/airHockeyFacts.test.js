import { describe, test, expect } from 'vitest';
import { AIR_HOCKEY_FACTS, randomFact } from '../src/airHockeyFacts.js';

describe('air hockey facts', () => {
	test('list contains at least 20 facts', () => {
		expect(AIR_HOCKEY_FACTS.length).toBeGreaterThanOrEqual(20);
	});

	test('every fact is a non-empty string ending with a period', () => {
		for (const fact of AIR_HOCKEY_FACTS) {
			expect(typeof fact).toBe('string');
			expect(fact.length).toBeGreaterThan(0);
			expect(fact.endsWith('.')).toBe(true);
		}
	});

	test('randomFact returns a value from the list', () => {
		for (let i = 0; i < 50; i++) {
			expect(AIR_HOCKEY_FACTS).toContain(randomFact());
		}
	});

	test('facts have no duplicates', () => {
		const set = new Set(AIR_HOCKEY_FACTS);
		expect(set.size).toBe(AIR_HOCKEY_FACTS.length);
	});
});
