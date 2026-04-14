import { wrapSocket } from '../network/transport.js';

const HELLO_TIMEOUT_MS = 5000;
import {
	MSG,
	ERR,
	welcome,
	error as errorMsg,
} from '../network/protocol.js';
import {
	Player,
	register,
	unregister,
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
	let helloTimer = null;

	function clearHelloTimer() {
		if (helloTimer !== null) {
			clearTimeout(helloTimer);
			helloTimer = null;
		}
	}

	function sendError(code, message = code) {
		wrapped?.send(errorMsg({ code, message }));
	}

	// Every HELLO mints a fresh Player. The client may send a stored
	// clientId/sessionToken from a prior welcome — we ignore them. When
	// real mid-game reconnect is needed, it will live in Room, not here.
	function handleHello(msg) {
		clearHelloTimer();
		if (msg.type !== MSG.HELLO) {
			sendError(ERR.BAD_MESSAGE, 'expected hello');
			wrapped.close();
			return;
		}
		player = new Player({
			clientId:     generateSecret(),
			sessionToken: generateSecret(),
			name:         msg.name || 'anonymous',
			socket:       wrapped,
		});
		register(player);
		wrapped.send(welcome({
			clientId: player.clientId,
			sessionToken: player.sessionToken,
			name: player.name,
		}));
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
		clearHelloTimer();
		if (!player) return;
		unsubscribeLobby(player);
		player.socket = null;
		player.room?.removeMember(player, { disconnected: true });
		unregister(player);
	}

	wrapped = wrapSocket(rawSocket, { onMessage, onClose, onError: () => {} });
	helloTimer = setTimeout(() => {
		if (!player) wrapped.close();
	}, HELLO_TIMEOUT_MS);
	helloTimer?.unref?.();
}
