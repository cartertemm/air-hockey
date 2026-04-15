import { inputMsg, MSG } from '../../network/protocol.js';
import { EventEmitter } from '../events.js';

const MIN_INPUT_INTERVAL_MS = 1000 / 60;

export function createGameClient({ socket, now = () => Date.now() }) {
	const emitter = new EventEmitter();
	let lastSentAt = -Infinity;
	let pendingInput = null;
	let tick = 0;

	function flushPending() {
		if (!pendingInput) return;
		socket.send(inputMsg({ tick: tick++, ...pendingInput }));
		lastSentAt = now();
		pendingInput = null;
	}

	function sendInput({ x, y, onTable }) {
		const time = now();
		if (time - lastSentAt >= MIN_INPUT_INTERVAL_MS) {
			socket.send(inputMsg({ tick: tick++, x, y, onTable }));
			lastSentAt = time;
			pendingInput = null;
			return;
		}
		pendingInput = { x, y, onTable };
	}

	function handleMessage(msg) {
		if (msg.type === MSG.GAME_START) emitter.emit('gameStart', msg);
		else if (msg.type === MSG.GAME_SNAPSHOT) emitter.emit('snapshot', msg);
		else if (msg.type === MSG.GAME_END) emitter.emit('gameEnd', msg);
	}

	return {
		sendInput,
		flushPending,
		handleMessage,
		on: (event, handler) => emitter.on(event, handler),
		off: (event, handler) => emitter.off(event, handler),
	};
}
