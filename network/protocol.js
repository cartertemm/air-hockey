export const MSG = Object.freeze({
	// Client -> Server
	HELLO:             'hello',
	LOBBY_SUBSCRIBE:   'lobby:subscribe',
	LOBBY_UNSUBSCRIBE: 'lobby:unsubscribe',
	ROOM_CREATE:       'room:create',
	ROOM_JOIN:         'room:join',
	ROOM_LEAVE:        'room:leave',
	ROOM_READY:        'room:ready',
	ROOM_UNREADY:      'room:unready',
	ROOM_CONFIRM:      'room:confirm',
	INPUT:             'input',
	PAUSE_TOGGLE:      'pause:toggle',
	SCORE_READOUT:     'score:readout',
	// Signaling (bidirectional relay)
	SIGNAL_OFFER:      'signal:offer',
	SIGNAL_ANSWER:     'signal:answer',
	SIGNAL_ICE:        'signal:ice',
	// Server -> Client
	WELCOME:           'welcome',
	LOBBY_UPDATE:      'lobby:update',
	ROOM_STATE:        'room:state',
	ROOM_COUNTDOWN:    'room:countdown',
	GAME_START:        'game:start',
	GAME_SNAPSHOT:     'game:snapshot',
	GAME_END:          'game:end',
	ERROR:             'error',
});

export const ERR = Object.freeze({
	UNAUTHORIZED:      'unauthorized',
	SESSION_ACTIVE:    'session_active',
	ROOM_FULL:         'room_full',
	ROOM_NOT_JOINABLE: 'room_not_joinable',
	ROOM_NOT_FOUND:    'room_not_found',
	NOT_IN_ROOM:       'not_in_room',
	BAD_MESSAGE:       'bad_message',
});

export class ProtocolError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

// ---- Client -> Server factories -----------------------------------------

export function hello({ clientId, sessionToken, name }) {
	return { type: MSG.HELLO, clientId, sessionToken, name };
}

export function lobbySubscribe() {
	return { type: MSG.LOBBY_SUBSCRIBE };
}

export function lobbyUnsubscribe() {
	return { type: MSG.LOBBY_UNSUBSCRIBE };
}

export function roomCreate({ mode, pointLimit }) {
	return { type: MSG.ROOM_CREATE, mode, pointLimit };
}

export function roomJoin({ roomId }) {
	return { type: MSG.ROOM_JOIN, roomId };
}

export function roomLeave() {
	return { type: MSG.ROOM_LEAVE };
}

export function roomReady() {
	return { type: MSG.ROOM_READY };
}

export function roomUnready() {
	return { type: MSG.ROOM_UNREADY };
}

export function roomConfirm() {
	return { type: MSG.ROOM_CONFIRM };
}

// ---- Server -> Client factories -----------------------------------------

export function welcome({ clientId, sessionToken, name }) {
	return { type: MSG.WELCOME, clientId, sessionToken, name };
}

export function roomState({ room }) {
	return { type: MSG.ROOM_STATE, room };
}

export function roomCountdown({ roomId }) {
	return { type: MSG.ROOM_COUNTDOWN, roomId };
}

export function lobbyUpdate({ full, rooms, removedIds = [] }) {
	return { type: MSG.LOBBY_UPDATE, full, rooms, removedIds };
}

export function error({ code, message }) {
	return { type: MSG.ERROR, code, message };
}

// ---- Gameplay factories -------------------------------------------------

export function inputMsg({ tick, x, y, onTable }) {
	return { type: MSG.INPUT, tick, x, y, onTable };
}

export function scoreReadoutMsg() {
	return { type: MSG.SCORE_READOUT };
}

export function signalOffer({ sdp }) {
	return { type: MSG.SIGNAL_OFFER, sdp };
}

export function signalAnswer({ sdp }) {
	return { type: MSG.SIGNAL_ANSWER, sdp };
}

export function signalIce({ candidate }) {
	return { type: MSG.SIGNAL_ICE, candidate };
}

export function pauseToggleMsg() {
	return { type: MSG.PAUSE_TOGGLE };
}

export function gameStart({ localPlayer, pointLimit }) {
	return { type: MSG.GAME_START, localPlayer, pointLimit };
}

export function gameSnapshot({ tick, state, puck, mallets, scores, servingPlayer, events }) {
	return { type: MSG.GAME_SNAPSHOT, tick, state, puck, mallets, scores, servingPlayer, events };
}

export function gameEnd({ winner, finalScore }) {
	return { type: MSG.GAME_END, winner, finalScore };
}

// ---- Wire codec ----------------------------------------------------------

export function encode(msg) {
	return JSON.stringify(msg);
}

export function decode(text) {
	let msg;
	try {
		msg = JSON.parse(text);
	} catch {
		throw new ProtocolError(ERR.BAD_MESSAGE, 'invalid JSON');
	}
	if (!msg || typeof msg.type !== 'string') {
		throw new ProtocolError(ERR.BAD_MESSAGE, 'missing or non-string type');
	}
	return msg;
}
