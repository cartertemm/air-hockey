import crypto from 'node:crypto';

// ---- Player instances ----------------------------------------------------

// Player lifetime equals socket lifetime. A Player exists from HELLO until
// its WebSocket closes; at that point it is removed from its room (if any)
// and unregistered. There is no grace window, no resume, no reaper.

export class Player {
	constructor({ clientId, sessionToken, name, socket }) {
		this.clientId = clientId;
		this.sessionToken = sessionToken;
		this.name = name;
		this.socket = socket;
		this.room = null;
	}

	send(msg) { this.socket?.send(msg); }
	isConnected() { return this.socket !== null; }

	toMemberSnapshot() {
		return {
			clientId: this.clientId,
			name: this.name,
			ready:     this.room?.isReady(this)     ?? false,
			confirmed: this.room?.isConfirmed(this) ?? false,
			connected: this.isConnected(),
		};
	}
}

// ---- Registry ------------------------------------------------------------

const byId = new Map();

export function register(player)    { byId.set(player.clientId, player); }
export function lookup(clientId)    { return byId.get(clientId) ?? null; }
export function unregister(player)  { byId.delete(player.clientId); }
export function allPlayers()        { return byId.values(); }

// Test-only: reset the registry between specs.
export function _resetPlayers() { byId.clear(); }

// ---- Secret generator ----------------------------------------------------

export function generateSecret() {
	return crypto.randomBytes(16).toString('hex');
}
