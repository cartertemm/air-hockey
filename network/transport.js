import {
	wrapSocket as wrapSocketWithCodec,
	createReconnectingClient as createReconnectingClientWithCodec,
} from 'audiogame-utils/net';
import { encode, decode } from './protocol.js';

// Binds the shared wire format to the generic transport, so neither the client
// nor the server has to pass a codec at every call site.
const codec = { encode, decode };

export function wrapSocket(socket, options = {}) {
	return wrapSocketWithCodec(socket, { codec, ...options });
}

export function createReconnectingClient(options = {}) {
	return createReconnectingClientWithCodec({ codec, ...options });
}
