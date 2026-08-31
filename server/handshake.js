import { MSG, ERR, welcome, error as errorMsg } from '../network/protocol.js';
import {
	RoomError,
	createRoom,
	getRoom,
	subscribeLobby,
	unsubscribeLobby,
} from './room.js';

const HELLO_TIMEOUT_MS = 5000;

function sendError(player, code, message = code) {
	player.send(errorMsg({ code, message }));
}

function role(player) {
	return player.data.room.members[0] === player ? 'p1' : 'p2';
}

function dispatch(player, msg) {
	const room = player.data.room;
	switch (msg.type) {
		case MSG.ROOM_CREATE:
			createRoom(player, { mode: msg.mode, pointLimit: msg.pointLimit });
			break;
		case MSG.ROOM_JOIN: {
			const target = getRoom(msg.roomId);
			if (!target) throw new RoomError(ERR.ROOM_NOT_FOUND);
			target.addMember(player);
			break;
		}
		case MSG.ROOM_LEAVE:
			room?.removeMember(player);
			break;
		case MSG.ROOM_READY:
			room?.setReady(player, true);
			break;
		case MSG.ROOM_UNREADY:
			room?.setReady(player, false);
			break;
		case MSG.ROOM_CONFIRM:
			room?.setConfirmed(player);
			break;
		case MSG.INPUT:
			room?.game?.applyInput(role(player), { x: msg.x, y: msg.y, onTable: !!msg.onTable });
			break;
		case MSG.PAUSE_TOGGLE:
			if (room?.game) room.game.togglePause(role(player), player.data.name);
			break;
		case MSG.SCORE_READOUT:
			break;
		case MSG.LOBBY_SUBSCRIBE:
			subscribeLobby(player);
			break;
		case MSG.LOBBY_UNSUBSCRIBE:
			unsubscribeLobby(player);
			break;
		default:
			sendError(player, ERR.BAD_MESSAGE, `unknown type ${msg.type}`);
	}
}

export function attachHandlers(game) {
	game.on('connection', (player) => {
		player.data.name = null;
		player.data.room = null;
		player.data.helloTimer = setTimeout(() => {
			if (!player.data.name) player.close();
		}, HELLO_TIMEOUT_MS);
		player.data.helloTimer?.unref?.();
	});
	game.on('message', (player, msg) => {
		if (!msg || typeof msg.type !== 'string') {
			sendError(player, ERR.BAD_MESSAGE);
			player.close();
			return;
		}
		if (!player.data.name) {
			if (msg.type !== MSG.HELLO) {
				sendError(player, ERR.BAD_MESSAGE, 'expected hello');
				player.close();
				return;
			}
			clearTimeout(player.data.helloTimer);
			player.data.name = msg.name || 'anonymous';
			player.send(welcome({ clientId: player.id, name: player.data.name }));
			return;
		}
		try {
			dispatch(player, msg);
		} catch (err) {
			if (!(err instanceof RoomError)) throw err;
			sendError(player, err.code);
		}
	});
	game.on('disconnect', (player) => {
		clearTimeout(player.data.helloTimer);
		unsubscribeLobby(player);
		player.data.room?.removeMember(player, { disconnected: true });
		player.close();
	});
	game.on('error', (err) => console.error('[server]', err));
}
