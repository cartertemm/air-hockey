import { describe, test, expect } from 'vitest';
import { mintRoomId } from '../game/roomId.js';

describe('mintRoomId', () => {
	test('returns an adjective-noun-number string', () => {
		const id = mintRoomId();
		expect(id).toMatch(/^[a-z]+-[a-z]+-\d+$/);
	});

	test('number suffix is in range 0–999', () => {
		const id = mintRoomId();
		const num = parseInt(id.split('-')[2], 10);
		expect(num).toBeGreaterThanOrEqual(0);
		expect(num).toBeLessThan(1000);
	});

	test('respects collision set — never returns an existing id', () => {
		const existing = new Set();
		for (let i = 0; i < 50; i++) {
			const id = mintRoomId(existing);
			expect(existing.has(id)).toBe(false);
			existing.add(id);
		}
	});

	test('works without arguments (no collision check)', () => {
		expect(() => mintRoomId()).not.toThrow();
	});

	test('throws when all ids are taken', () => {
		// Fill every possible combination
		const ADJECTIVES = ['swift', 'brave', 'quiet', 'bright', 'calm', 'wild'];
		const NOUNS = ['otter', 'falcon', 'comet', 'ember', 'river', 'spark'];
		const all = new Set();
		for (const adj of ADJECTIVES) {
			for (const n of NOUNS) {
				for (let i = 0; i < 1000; i++) {
					all.add(`${adj}-${n}-${i}`);
				}
			}
		}
		expect(() => mintRoomId(all)).toThrow('mintRoomId: failed to find a unique id');
	});
});
