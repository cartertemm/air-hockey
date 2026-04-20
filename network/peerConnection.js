import { WebRTCTransport } from './webrtcTransport.js';

const ICE_CONFIG = {
	iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/**
 * Host side: creates a DataChannel, generates an offer, waits for answer.
 * Resolves with a WebRTCTransport once the DataChannel opens.
 *
 * @param {{ signaling: object }} options
 * @returns {Promise<WebRTCTransport>}
 */
export function createHostPeerConnection({ signaling }) {
	return new Promise((resolve, reject) => {
		const pc = new RTCPeerConnection(ICE_CONFIG);
		const channel = pc.createDataChannel('game', { ordered: true });
		pc.onicecandidate = ({ candidate }) => {
			if (candidate) signaling.sendIce(candidate);
		};
		signaling.onAnswer(async sdp => {
			await pc.setRemoteDescription({ type: 'answer', sdp });
		});
		signaling.onIce(candidate => {
			pc.addIceCandidate(candidate).catch(() => {});
		});
		channel.onopen = () => resolve(new WebRTCTransport(channel, pc));
		channel.onerror = err => reject(err);
		pc.createOffer()
			.then(offer => pc.setLocalDescription(offer))
			.then(() => signaling.sendOffer(pc.localDescription.sdp))
			.catch(reject);
	});
}

/**
 * Guest side: waits for an offer, generates an answer, waits for DataChannel.
 * Resolves with a WebRTCTransport once the DataChannel opens.
 *
 * @param {{ signaling: object }} options
 * @returns {Promise<WebRTCTransport>}
 */
export function createGuestPeerConnection({ signaling }) {
	return new Promise((resolve, reject) => {
		const pc = new RTCPeerConnection(ICE_CONFIG);
		pc.onicecandidate = ({ candidate }) => {
			if (candidate) signaling.sendIce(candidate);
		};
		signaling.onIce(candidate => {
			pc.addIceCandidate(candidate).catch(() => {});
		});
		pc.ondatachannel = ({ channel }) => {
			channel.onopen = () => resolve(new WebRTCTransport(channel, pc));
			channel.onerror = err => reject(err);
		};
		signaling.onOffer(async sdp => {
			await pc.setRemoteDescription({ type: 'offer', sdp });
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			signaling.sendAnswer(pc.localDescription.sdp);
		});
	});
}
