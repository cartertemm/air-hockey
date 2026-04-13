import { wrapSocket } from '../network/transport.js';
import {
	MSG,
	ERR,
	welcome,
	error as errorMsg,
} from '../network/protocol.js';
import {
	Player,
	register,
	lookup,
	generateSecret,
} from './player.js';
import {
	RoomError,
	createRoom,
	getRoom,
	subscribeLobby,
	unsubscribeLobby,
} from './room.js';

export function handleConnection(rawSocket) {
	let player = null;
	let wrapped = null;

	function sendError(code, message = code) {
		wrapped?.send(errorMsg({ code, message }));
	}

	function mintFreshPlayer(name) {
		const p = new Player({
			clientId:     generateSecret(),
			sessionToken: generateSecret(),
			name:         name || 'anonymous',
			socket:       wrapped,
		});
		register(p);
		return p;
	}

	function handleHello(msg) {
		if (msg.type !== MSG.HELLO) {
			sendError(ERR.BAD_MESSAGE, 'expected hello');
			wrapped.close();
			return;
		}
		const { clientId, sessionToken, name } = msg;

		if (!clientId) {
			player = mintFreshPlayer(name);
			wrapped.send(welcome({
				clientId: player.clientId,
				sessionToken: player.sessionToken,
				name: player.name,
				resumed: false,
			}));
			return;
		}

		const existing = lookup(clientId);

		if (!existing) {
			player = mintFreshPlayer(name);
			wrapped.send(welcome({
				clientId: player.clientId,
				sessionToken: player.sessionToken,
				name: player.name,
				resumed: false,
			}));
			return;
		}

		if (existing.isConnected()) {
			sendError(ERR.SESSION_ACTIVE);
			wrapped.close();
			return;
		}

		if (existing.sessionToken !== sessionToken) {
			sendError(ERR.UNAUTHORIZED);
			wrapped.close();
			return;
		}

		existing.attachSocket(wrapped);
		existing.rotateToken();
		player = existing;
		wrapped.send(welcome({
			clientId: player.clientId,
			sessionToken: player.sessionToken,
			name: player.name,
			resumed: true,
		}));
		player.room?.resendStateTo(player);
	}

	function dispatch(msg) {
		switch (msg.type) {
			case MSG.ROOM_CREATE:
				createRoom(player, { mode: msg.mode, pointLimit: msg.pointLimit });
				break;
			case MSG.ROOM_JOIN: {
				const room = getRoom(msg.roomId);
				if (!room) { sendError(ERR.ROOM_NOT_FOUND); break; }
				room.addMember(player);
				break;
			}
			case MSG.ROOM_LEAVE:
				player.room?.removeMember(player);
				break;
			case MSG.ROOM_READY:
				player.room?.setReady(player, true);
				break;
			case MSG.ROOM_UNREADY:
				player.room?.setReady(player, false);
				break;
			case MSG.ROOM_CONFIRM:
				player.room?.setConfirmed(player);
				break;
			case MSG.LOBBY_SUBSCRIBE:
				subscribeLobby(player);
				break;
			case MSG.LOBBY_UNSUBSCRIBE:
				unsubscribeLobby(player);
				break;
			default:
				sendError(ERR.BAD_MESSAGE, `unknown type ${msg.type}`);
		}
	}

	function onMessage(msg) {
		if (!player) { handleHello(msg); return; }
		try {
			dispatch(msg);
		} catch (err) {
			if (err instanceof RoomError) sendError(err.code);
			else throw err;
		}
	}

	function onClose() {
		if (!player) return;
		unsubscribeLobby(player);
		player.detachSocket();
		player.room?.onMemberDisconnected(player);
	}

	wrapped = wrapSocket(rawSocket, { onMessage, onClose, onError: () => {} });
}
