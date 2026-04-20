import { MSG, ERR, roomState, roomCountdown, lobbyUpdate } from '../network/protocol.js';
import { GameSession } from '../game/gameSession.js';
import { mintRoomId } from '../game/roomId.js';

// ---- Room instances ------------------------------------------------------

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
		host.room = this;
		this.game = null;
	}

	addMember(player) {
		if (this.isFull())            throw new RoomError(ERR.ROOM_FULL);
		if (this.phase !== 'waiting') throw new RoomError(ERR.ROOM_NOT_JOINABLE);
		this.members.push(player);
		player.room = this;
		this.broadcastState();
		broadcastLobbyUpdate();
	}

	removeMember(player, { disconnected = false } = {}) {
		const announcement = disconnected ? `${player.name} has disconnected.` : null;
		this.members = this.members.filter(m => m !== player);
		this.ready.delete(player);
		this.confirmed.delete(player);
		this.startRequested = false;
		player.room = null;
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
			members: this.members.map(m => m.toMemberSnapshot()),
			createdAt: this.createdAt,
			lastEventMessage: eventMessage,
		};
	}

	summary() {
		return {
			id: this.id,
			hostName: this.host.name,
			mode: this.mode,
			pointLimit: this.pointLimit,
			memberCount: this.members.length,
			phase: this.phase,
		};
	}

	broadcastState(eventMessage = null) {
		for (const m of this.members) m.send(roomState({ room: this.snapshot(eventMessage) }));
	}

	broadcastCountdown() {
		for (const m of this.members) m.send(roomCountdown({ roomId: this.id }));
	}

	startGame() {
		const [host, guest] = this.members;
		this.game = new GameSession({
			p1: host,
			p2: guest,
			pointLimit: this.pointLimit,
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
const lobbySubscribers = new Set();

export function createRoom(host, { mode, pointLimit }) {
	const id = mintRoomId(byId);
	const room = new Room({ id, host, mode, pointLimit });
	byId.set(id, room);
	room.broadcastState();
	broadcastLobbyUpdate();
	return room;
}

export function destroyRoom(room) {
	room.game?.stopRealTimeLoop();
	room.game = null;
	byId.delete(room.id);
	broadcastLobbyUpdate();
}

export function getRoom(id) {
	return byId.get(id) ?? null;
}

export function subscribeLobby(player) {
	lobbySubscribers.add(player);
	sendLobbySnapshotTo(player);
}

export function unsubscribeLobby(player) {
	lobbySubscribers.delete(player);
}

function sendLobbySnapshotTo(player) {
	player.send(lobbyUpdate({
		full: true,
		rooms: [...byId.values()].map(r => r.summary()),
	}));
}

function broadcastLobbyUpdate() {
	for (const p of lobbySubscribers) sendLobbySnapshotTo(p);
}

// Test-only: reset everything between specs.
export function _resetRooms() {
	for (const room of byId.values()) {
		room.game?.stopRealTimeLoop();
		room.game = null;
	}
	byId.clear();
	lobbySubscribers.clear();
}
