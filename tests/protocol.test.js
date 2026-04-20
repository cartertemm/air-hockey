import { describe, test, expect } from 'vitest';
import {
	MSG,
	ERR,
	hello,
	welcome,
	roomCreate,
	roomJoin,
	roomState,
	roomCountdown,
	lobbyUpdate,
	error,
	signalOffer,
	signalAnswer,
	signalIce,
	encode,
	decode,
	ProtocolError,
} from '../network/protocol.js';

describe('protocol constants', () => {
	test('MSG contains all required client and server types', () => {
		expect(MSG.HELLO).toBe('hello');
		expect(MSG.WELCOME).toBe('welcome');
		expect(MSG.ROOM_CREATE).toBe('room:create');
		expect(MSG.ROOM_JOIN).toBe('room:join');
		expect(MSG.ROOM_LEAVE).toBe('room:leave');
		expect(MSG.ROOM_READY).toBe('room:ready');
		expect(MSG.ROOM_UNREADY).toBe('room:unready');
		expect(MSG.ROOM_CONFIRM).toBe('room:confirm');
		expect(MSG.LOBBY_SUBSCRIBE).toBe('lobby:subscribe');
		expect(MSG.LOBBY_UNSUBSCRIBE).toBe('lobby:unsubscribe');
		expect(MSG.ROOM_STATE).toBe('room:state');
		expect(MSG.ROOM_COUNTDOWN).toBe('room:countdown');
		expect(MSG.LOBBY_UPDATE).toBe('lobby:update');
		expect(MSG.ERROR).toBe('error');
	});

	test('MSG contains signal types', () => {
		expect(MSG.SIGNAL_OFFER).toBe('signal:offer');
		expect(MSG.SIGNAL_ANSWER).toBe('signal:answer');
		expect(MSG.SIGNAL_ICE).toBe('signal:ice');
	});

	test('MSG is frozen', () => {
		expect(Object.isFrozen(MSG)).toBe(true);
	});

	test('ERR contains all required error codes and is frozen', () => {
		expect(ERR.UNAUTHORIZED).toBe('unauthorized');
		expect(ERR.SESSION_ACTIVE).toBe('session_active');
		expect(ERR.ROOM_FULL).toBe('room_full');
		expect(ERR.ROOM_NOT_JOINABLE).toBe('room_not_joinable');
		expect(ERR.ROOM_NOT_FOUND).toBe('room_not_found');
		expect(ERR.NOT_IN_ROOM).toBe('not_in_room');
		expect(ERR.BAD_MESSAGE).toBe('bad_message');
		expect(Object.isFrozen(ERR)).toBe(true);
	});
});

describe('protocol factories', () => {
	test('hello with all fields', () => {
		expect(hello({ clientId: 'c1', sessionToken: 't1', name: 'Swift Otter' })).toEqual({
			type: 'hello',
			clientId: 'c1',
			sessionToken: 't1',
			name: 'Swift Otter',
		});
	});

	test('hello with only a name', () => {
		expect(hello({ name: 'Swift Otter' })).toEqual({
			type: 'hello',
			clientId: undefined,
			sessionToken: undefined,
			name: 'Swift Otter',
		});
	});

	test('welcome carries clientId, sessionToken, and name', () => {
		expect(welcome({ clientId: 'c1', sessionToken: 't1', name: 'Swift Otter' })).toEqual({
			type: 'welcome',
			clientId: 'c1',
			sessionToken: 't1',
			name: 'Swift Otter',
		});
	});

	test('roomCreate, roomJoin, roomState, roomCountdown', () => {
		expect(roomCreate({ mode: 'bestOf3', pointLimit: 11 })).toEqual({
			type: 'room:create', mode: 'bestOf3', pointLimit: 11,
		});
		expect(roomJoin({ roomId: 'r1' })).toEqual({ type: 'room:join', roomId: 'r1' });
		expect(roomState({ room: { id: 'r1' } })).toEqual({ type: 'room:state', room: { id: 'r1' } });
		expect(roomCountdown({ roomId: 'r1' })).toEqual({ type: 'room:countdown', roomId: 'r1' });
	});

	test('lobbyUpdate defaults removedIds to []', () => {
		expect(lobbyUpdate({ full: true, rooms: [] })).toEqual({
			type: 'lobby:update', full: true, rooms: [], removedIds: [],
		});
	});

	test('error factory', () => {
		expect(error({ code: 'room_full', message: 'nope' })).toEqual({
			type: 'error', code: 'room_full', message: 'nope',
		});
	});

	test('signalOffer factory', () => {
		expect(signalOffer({ sdp: 'v=0...' })).toEqual({ type: 'signal:offer', sdp: 'v=0...' });
	});

	test('signalAnswer factory', () => {
		expect(signalAnswer({ sdp: 'v=0 answer' })).toEqual({ type: 'signal:answer', sdp: 'v=0 answer' });
	});

	test('signalIce factory', () => {
		const candidate = { candidate: 'candidate:...', sdpMid: 'data', sdpMLineIndex: 0 };
		expect(signalIce({ candidate })).toEqual({ type: 'signal:ice', candidate });
	});
});

describe('encode / decode', () => {
	test('encode produces JSON text', () => {
		const text = encode(hello({ name: 'Swift Otter' }));
		expect(typeof text).toBe('string');
		expect(JSON.parse(text)).toEqual({
			type: 'hello', clientId: undefined, sessionToken: undefined, name: 'Swift Otter',
		});
	});

	test('decode round-trips a valid message', () => {
		const msg = roomCreate({ mode: 'single', pointLimit: 7 });
		expect(decode(encode(msg))).toEqual(msg);
	});

	test('decode throws ProtocolError on non-JSON', () => {
		expect(() => decode('not json at all')).toThrow(ProtocolError);
	});

	test('decode throws ProtocolError on missing type', () => {
		expect(() => decode(JSON.stringify({ no: 'type' }))).toThrow(ProtocolError);
	});

	test('decode throws ProtocolError on non-string type', () => {
		expect(() => decode(JSON.stringify({ type: 42 }))).toThrow(ProtocolError);
	});

	test('ProtocolError carries a code', () => {
		try {
			decode('garbage');
			expect.fail('expected throw');
		} catch (err) {
			expect(err).toBeInstanceOf(ProtocolError);
			expect(err.code).toBe(ERR.BAD_MESSAGE);
		}
	});
});
