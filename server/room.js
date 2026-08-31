import { random_choice, random_int } from 'audiogame-utils/math';
import { MSG, ERR, roomState, roomCountdown, lobbyUpdate } from '../network/protocol.js';
import { GameSession } from './gameSession.js';

const ADJECTIVES = ['swift', 'brave', 'quiet', 'bright', 'calm', 'wild'];
const NOUNS      = ['otter', 'falcon', 'comet', 'ember', 'river', 'spark'];

let server = null;

export function initRooms(instance) {
	server = instance;
}

function lobbyGroup() {
	return server.group('lobby');
}

// ---- Room instances ------------------------------------------------------

function memberSnapshot(player, room) {
	return {
		clientId: player.id,
		name: player.data.name,
		ready: room.isReady(player),
		confirmed: room.isConfirmed(player),
		connected: player.connected,
	};
}

export class Room {
	constructor({ id, host, mode, pointLimit }) {
		this.id = id;
		this.host = host;
		this.members = [host];
		this.mode = mode;
		this.pointLimit = pointLimit;
		this.phase = 'waiting';
		this.ready = new WeakSet();
		this.confirmed = new WeakSet();
		this.startRequested = false;
		this.createdAt = Date.now();
		host.data.room = this;
		this.game = null;
		this.group().add(host);
	}

	group() {
		return server.group(`room:${this.id}`, { persist: true });
	}

	addMember(player) {
		if (this.isFull())            throw new RoomError(ERR.ROOM_FULL);
		if (this.phase !== 'waiting') throw new RoomError(ERR.ROOM_NOT_JOINABLE);
		this.members.push(player);
		this.group().add(player);
		player.data.room = this;
		this.broadcastState();
		broadcastLobbyUpdate();
	}

	removeMember(player, { disconnected = false } = {}) {
		const announcement = disconnected ? `${player.data.name} has disconnected.` : null;
		this.members = this.members.filter(m => m !== player);
		this.group().remove(player);
		this.ready.delete(player);
		this.confirmed.delete(player);
		this.startRequested = false;
		player.data.room = null;
		if (this.game) {
			this.game.stopRealTimeLoop();
			this.game = null;
		}
		for (const m of this.members) {
			this.ready.delete(m);
			this.confirmed.delete(m);
		}
		this.phase = 'waiting';
		if (this.members.length === 0) {
			destroyRoom(this);
			return;
		}
		this.broadcastState(announcement);
		broadcastLobbyUpdate();
	}

	setReady(player, ready) {
		if (ready) this.ready.add(player);
		else this.ready.delete(player);
		const wasReady = this.phase === 'ready';
		if (this.allReady()) this.phase = 'ready';
		else if (wasReady)   this.phase = 'waiting';
		if (this.phase !== 'ready') {
			this.startRequested = false;
			for (const member of this.members) this.confirmed.delete(member);
		}
		this.broadcastState();
		broadcastLobbyUpdate();
	}

	setConfirmed(player) {
		if (this.phase !== 'ready') {
			this.broadcastState();
			broadcastLobbyUpdate();
			return;
		}
		this.confirmed.add(player);
		if (player === this.members[0]) this.startRequested = true;
		if (this.startRequested && this.allConfirmed()) {
			this.phase = 'countdown';
			this.broadcastCountdown();
			this.startGame();
		}
		this.broadcastState();
		broadcastLobbyUpdate();
	}

	isFull()       { return this.members.length >= 2; }
	allReady()     { return this.members.length === 2 && this.members.every(m => this.ready.has(m)); }
	allConfirmed() { return this.members.length === 2 && this.members.every(m => this.confirmed.has(m)); }
	isReady(p)     { return this.ready.has(p); }
	isConfirmed(p) { return this.confirmed.has(p); }

	snapshot(eventMessage = null) {
		return {
			id: this.id,
			mode: this.mode,
			pointLimit: this.pointLimit,
			phase: this.phase,
			members: this.members.map(m => memberSnapshot(m, this)),
			createdAt: this.createdAt,
			lastEventMessage: eventMessage,
		};
	}

	summary() {
		return {
			id: this.id,
			hostName: this.host.data.name,
			mode: this.mode,
			pointLimit: this.pointLimit,
			memberCount: this.members.length,
			phase: this.phase,
		};
	}

	broadcastState(eventMessage = null) {
		this.group().send(roomState({ room: this.snapshot(eventMessage) }));
	}

	broadcastCountdown() {
		this.group().send(roomCountdown({ roomId: this.id }));
	}

	startGame() {
		const [host, guest] = this.members;
		const bestOf = this.mode === 'bestOf3' ? 3 : 1;
		this.game = new GameSession({
			p1: host,
			p2: guest,
			pointLimit: this.pointLimit,
			bestOf,
			onEnd: ({ winner, finalScore }) => this._finishGame({ winner, finalScore }),
		});
		this.phase = 'playing';
		this.game.start({ now: 0 });
		this.game.startRealTimeLoop();
		this.broadcastState();
	}

	_finishGame({ winner, finalScore }) {
		if (!this.game) return;
		this.game.sendGameEnd({ winner, finalScore });
		this.game.stopRealTimeLoop();
		this.game = null;
		for (const member of this.members) {
			this.ready.delete(member);
			this.confirmed.delete(member);
		}
		this.startRequested = false;
		this.phase = 'waiting';
		this.broadcastState();
		broadcastLobbyUpdate();
	}
}

export class RoomError extends Error {
	constructor(code) {
		super(code);
		this.code = code;
	}
}

// ---- Registry + lobby subscriptions --------------------------------------

const byId = new Map();

export function createRoom(host, { mode, pointLimit }) {
	const id = mintRoomId();
	const room = new Room({ id, host, mode, pointLimit });
	byId.set(id, room);
	room.broadcastState();
	broadcastLobbyUpdate();
	return room;
}

export function destroyRoom(room) {
	room.game?.stopRealTimeLoop();
	room.game = null;
	room.group().close();
	byId.delete(room.id);
	broadcastLobbyUpdate();
}

export function getRoom(id) {
	return byId.get(id) ?? null;
}

function lobbySnapshot() {
	return lobbyUpdate({
		full: true,
		rooms: [...byId.values()].map(r => r.summary()),
	});
}

export function subscribeLobby(player) {
	lobbyGroup().add(player);
	player.send(lobbySnapshot());
}

export function unsubscribeLobby(player) {
	lobbyGroup().remove(player);
}

function broadcastLobbyUpdate() {
	lobbyGroup().send(lobbySnapshot());
}

function mintRoomId() {
	for (let attempt = 0; attempt < 100; attempt++) {
		const id = `${random_choice(ADJECTIVES)}-${random_choice(NOUNS)}-${random_int(0, 999)}`;
		if (!byId.has(id)) return id;
	}
	throw new Error('mintRoomId: failed to find a unique id');
}

// Test-only: reset everything between specs.
export function _resetRooms() {
	for (const room of byId.values()) {
		room.game?.stopRealTimeLoop();
		room.game = null;
	}
	byId.clear();
	server = null;
}
