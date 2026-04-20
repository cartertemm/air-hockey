import { GameSession } from './gameSession.js';

const p1 = { send(msg) { postMessage({ target: 'p1', msg }); } };
const p2 = { send(msg) { postMessage({ target: 'p2', msg }); } };

let session = null;

self.onmessage = (event) => {
	const data = event.data;
	if (data.type === 'init') {
		session = new GameSession({ p1, p2, pointLimit: data.pointLimit });
		session.start({ now: 0 });
		session.startRealTimeLoop();
		return;
	}
	if (data.type === 'stop') {
		session?.stopRealTimeLoop();
		return;
	}
	if (data.target === 'p1' || data.target === 'p2') {
		const msg = data.msg;
		if (msg.type === 'input') {
			session?.applyInput(data.target, { x: msg.x, y: msg.y, onTable: msg.onTable });
		} else if (msg.type === 'pause:toggle') {
			session?.togglePause(data.target, 'Player');
		}
	}
};
