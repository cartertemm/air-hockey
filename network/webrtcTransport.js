/**
 * WebRTCTransport — wraps an RTCDataChannel with the GameTransport interface.
 *
 * Interface:
 *   send(msg)       — serializes and sends via the data channel
 *   close()         — closes the channel and the peer connection
 *   onMessage(cb)   — register a single message handler (receives decoded objects)
 *   onClose(cb)     — register a single close handler
 */
export class WebRTCTransport {
	constructor(channel, peerConnection) {
		this._channel = channel;
		this._pc = peerConnection;
		this._onMessage = null;
		this._onClose = null;
		channel.onmessage = event => this._onMessage?.(JSON.parse(event.data));
		channel.onclose = () => this._onClose?.();
	}

	send(msg) {
		this._channel.send(JSON.stringify(msg));
	}

	close() {
		this._channel.close();
		this._pc.close();
	}

	onMessage(cb) {
		this._onMessage = cb;
	}

	onClose(cb) {
		this._onClose = cb;
	}
}
