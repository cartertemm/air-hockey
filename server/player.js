import crypto from 'node:crypto';

// ---- Player instances ----------------------------------------------------

export class Player {
	constructor({ clientId, sessionToken, name, socket }) {
		this.clientId = clientId;
		this.sessionToken = sessionToken;
		this.name = name;
		this.socket = socket;
		this.room = null;
		this.disconnectedAt = null;
	}

	send(msg) { this.socket?.send(msg); }
	isConnected() { return this.socket !== null; }

	attachSocket(socket) {
		this.socket = socket;
		this.disconnectedAt = null;
	}

	detachSocket() {
		this.socket = null;
		this.disconnectedAt = Date.now();
	}

	rotateToken() {
		this.sessionToken = generateSecret();
		return this.sessionToken;
	}

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

// ---- Reaper --------------------------------------------------------------

// Pure over an injected clock + grace window so it's trivial to unit test.
export function reapIdle({ now = Date.now(), graceMs } = {}) {
	for (const p of byId.values()) {
		if (p.isConnected()) continue;
		if (p.room !== null) continue;
		if (p.disconnectedAt === null) continue;
		if (now - p.disconnectedAt >= graceMs) byId.delete(p.clientId);
	}
}

// ---- Secret generator ----------------------------------------------------

export function generateSecret() {
	return crypto.randomBytes(16).toString('hex');
}
