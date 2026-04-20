import { wrapSocket } from './transport.js';

/**
 * Generic bidirectional message-oriented transport interface.
 *
 * Interface:
 *   send(msg)       — send a message (any serializable value)
 *   close()         — tear down the connection
 *   onMessage(cb)   — register a single message handler (receives decoded objects)
 *   onClose(cb)     — register a single close handler
 */

export class WebSocketTransport {
	constructor(socket) {
		this._onMessage = null;
		this._onClose = null;
		this._wrapped = wrapSocket(socket, {
			onMessage: msg => this._onMessage?.(msg),
			onClose: event => this._onClose?.(event),
		});
	}

	send(msg) {
		this._wrapped.send(msg);
	}

	close() {
		this._wrapped.close();
	}

	onMessage(cb) {
		this._onMessage = cb;
	}

	onClose(cb) {
		this._onClose = cb;
	}
}
