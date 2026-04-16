import { describe, test, expect } from 'vitest';
import {
	MSG,
	ERR,
	ProtocolError,
	inputMsg,
	gameStart,
	gameSnapshot,
	gameEnd,
	scoreReadoutMsg,
	encode,
	decode,
} from '../network/protocol.js';

describe('gameplay protocol', () => {
	test('inputMsg round-trip', () => {
		const m = inputMsg({ tick: 42, x: 12.5, y: 8.1, onTable: true });
		expect(m.type).toBe(MSG.INPUT);
		const decoded = decode(encode(m));
		expect(decoded).toEqual(m);
	});

	test('gameStart round-trip', () => {
		const m = gameStart({ localPlayer: 'p1', pointLimit: 7 });
		expect(m.type).toBe(MSG.GAME_START);
		expect(decode(encode(m))).toEqual(m);
	});

	test('gameSnapshot round-trip', () => {
		const m = gameSnapshot({
			tick: 10,
			state: 'PLAYING',
			puck: { x: 24, y: 48, vx: 0, vy: 0, omega: 0, onTable: true },
			mallets: {
				p1: { x: 24, y: 12, vx: 0, vy: 0, onTable: true },
				p2: { x: 24, y: 84, vx: 0, vy: 0, onTable: false },
			},
			scores: { p1: { points: 0 }, p2: { points: 0 } },
			servingPlayer: null,
			events: [],
		});
		expect(m.type).toBe(MSG.GAME_SNAPSHOT);
		expect(decode(encode(m))).toEqual(m);
	});

	test('gameEnd round-trip', () => {
		const m = gameEnd({ winner: 'p1', finalScore: { p1: 7, p2: 3 } });
		expect(m.type).toBe(MSG.GAME_END);
		expect(decode(encode(m))).toEqual(m);
	});

	test('scoreReadoutMsg round-trip', () => {
		const m = scoreReadoutMsg();
		expect(m.type).toBe(MSG.SCORE_READOUT);
		expect(decode(encode(m))).toEqual(m);
	});

	test('decode rejects malformed JSON', () => {
		expect(() => decode('not json')).toThrow(ProtocolError);
	});

	test('decode rejects missing type', () => {
		expect(() => decode('{}')).toThrow(ProtocolError);
	});
});
