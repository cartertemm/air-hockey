import { MSG, signalOffer, signalAnswer, signalIce } from './protocol.js';
import { WebRTCTransport } from './webrtcTransport.js';

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
 * PeerJS host: creates a Peer with id = roomCode, waits for an inbound connection.
 *
 * @param {string} roomCode
 * @returns {{ onConnection(cb), dispose() }}
 */
export function createPeerHost(roomCode) {
	let peer = null;
	let connectionCb = null;
	let started = false;
	async function start() {
		const { Peer } = await import('peerjs');
		peer = new Peer(roomCode);
		peer.on('connection', conn => {
			conn.on('open', () => {
				const transport = new WebRTCTransport(conn.dataChannel, conn.peerConnection);
				connectionCb?.(transport);
			});
		});
	}
	start().catch(() => {});
	return {
		onConnection(cb) { connectionCb = cb; },
		dispose() { peer?.destroy(); },
	};
}

/**
 * PeerJS guest: connects to roomCode, resolves with a GameTransport.
 *
 * @param {string} roomCode
 * @returns {Promise<WebRTCTransport>}
 */
export async function createPeerGuest(roomCode) {
	const { Peer } = await import('peerjs');
	return new Promise((resolve, reject) => {
		const peer = new Peer();
		peer.on('open', () => {
			const conn = peer.connect(roomCode);
			conn.on('open', () => {
				const transport = new WebRTCTransport(conn.dataChannel, conn.peerConnection);
				resolve(transport);
			});
			conn.on('error', reject);
		});
		peer.on('error', reject);
	});
}
