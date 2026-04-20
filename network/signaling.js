import { MSG, signalOffer, signalAnswer, signalIce } from './protocol.js';

const PEER_TIMEOUT_MS = 15000;
const PEER_ID_PREFIX = 'ah-';
const PEER_DEBUG = typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 2 : 0;

/**
 * Server-relay signaling: uses an existing WebSocket (wrapped socket) to
 * forward offer/answer/ICE between peers via the game server.
 *
 * @param {object} socket — wrapped socket with send() and onMessage()
 * @returns {{ sendOffer, sendAnswer, sendIce, onOffer, onAnswer, onIce, dispose }}
 */
export function createServerSignaling(socket) {
	let offerCb = null;
	let answerCb = null;
	let iceCb = null;
	function handleMessage(msg) {
		if (msg.type === MSG.SIGNAL_OFFER) offerCb?.(msg.sdp);
		else if (msg.type === MSG.SIGNAL_ANSWER) answerCb?.(msg.sdp);
		else if (msg.type === MSG.SIGNAL_ICE) iceCb?.(msg.candidate);
	}
	socket.onMessage(handleMessage);
	return {
		sendOffer(sdp) { socket.send(signalOffer({ sdp })); },
		sendAnswer(sdp) { socket.send(signalAnswer({ sdp })); },
		sendIce(candidate) { socket.send(signalIce({ candidate })); },
		onOffer(cb) { offerCb = cb; },
		onAnswer(cb) { answerCb = cb; },
		onIce(cb) { iceCb = cb; },
		dispose() { socket.onMessage(null); },
	};
}

/**
 * Wraps a PeerJS DataConnection with the GameTransport interface.
 * Uses PeerJS's public API (conn.send, conn.on('data')) instead of
 * extracting the raw DataChannel, which PeerJS manages internally.
 */
class PeerJSTransport {
	constructor(conn) {
		this._conn = conn;
		this._onMessage = null;
		this._onClose = null;
		conn.on('data', data => this._onMessage?.(data));
		conn.on('close', () => this._onClose?.());
	}
	send(msg) {
		this._conn.send(msg);
	}
	close() {
		this._conn.close();
	}
	onMessage(cb) {
		this._onMessage = cb;
	}
	onClose(cb) {
		this._onClose = cb;
	}
}

function peerIdFor(roomCode) {
	return PEER_ID_PREFIX + roomCode;
}

/**
 * PeerJS host: creates a Peer with id derived from roomCode, waits for an
 * inbound connection. Returns a promise that resolves once the host is
 * registered with the PeerJS cloud server and ready to accept connections.
 * Rejects after PEER_TIMEOUT_MS if the cloud server is unreachable.
 *
 * @param {string} roomCode
 * @returns {Promise<{ onConnection(cb), dispose() }>}
 */
export async function createPeerHost(roomCode) {
	const { Peer } = await import('peerjs');
	return new Promise((resolve, reject) => {
		const peerId = peerIdFor(roomCode);
		const peer = new Peer(peerId, { debug: PEER_DEBUG });
		let connectionCb = null;
		let settled = false;
		console.log('[host] registering as', peerId);
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			peer.destroy();
			reject(new Error('PeerJS signaling server timed out'));
		}, PEER_TIMEOUT_MS);
		peer.on('open', (id) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			console.log('[host] registered, waiting for guest on', id);
			peer.on('connection', conn => {
				console.log('[host] guest connecting...');
				conn.on('open', () => {
					console.log('[host] data channel open');
					connectionCb?.(new PeerJSTransport(conn));
				});
				conn.on('error', err => console.warn('[host] conn error', err));
			});
			resolve({
				onConnection(cb) { connectionCb = cb; },
				dispose() { peer.destroy(); },
			});
		});
		peer.on('error', (err) => {
			console.warn('[host] peer error', err);
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			peer.destroy();
			reject(err);
		});
	});
}

/**
 * PeerJS guest: connects to roomCode, resolves with a GameTransport.
 * Rejects after PEER_TIMEOUT_MS if connection cannot be established.
 *
 * @param {string} roomCode
 * @returns {Promise<PeerJSTransport>}
 */
export async function createPeerGuest(roomCode) {
	const { Peer } = await import('peerjs');
	return new Promise((resolve, reject) => {
		const targetId = peerIdFor(roomCode);
		const peer = new Peer({ debug: PEER_DEBUG });
		let settled = false;
		console.log('[guest] connecting to', targetId);
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			peer.destroy();
			reject(new Error('Connection to host timed out'));
		}, PEER_TIMEOUT_MS);
		peer.on('open', (myId) => {
			console.log('[guest] registered as', myId, '— connecting to', targetId);
			const conn = peer.connect(targetId, { reliable: true });
			conn.on('open', () => {
				console.log('[guest] data channel open');
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(new PeerJSTransport(conn));
			});
			conn.on('error', (err) => {
				console.warn('[guest] conn error', err);
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				peer.destroy();
				reject(err);
			});
		});
		peer.on('error', (err) => {
			console.warn('[guest] peer error', err);
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			peer.destroy();
			reject(err);
		});
	});
}
