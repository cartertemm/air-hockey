import { WorkerTransport } from '../network/workerTransport.js';
import { mintRoomId } from './roomId.js';

export function createLocalHost({ pointLimit }) {
	const worker = new Worker(new URL('./hostWorker.js', import.meta.url), { type: 'module' });
	const hostTransport = new WorkerTransport(worker, 'p1');
	const roomCode = mintRoomId();
	worker.postMessage({ type: 'init', pointLimit });

	function connectGuest(guestTransport) {
		worker.addEventListener('message', (event) => {
			if (event.data?.target === 'p2') {
				guestTransport.send(event.data.msg);
			}
		});
		guestTransport.onMessage((msg) => {
			worker.postMessage({ target: 'p2', msg });
		});
	}

	function dispose() {
		worker.postMessage({ type: 'stop' });
		worker.terminate();
	}

	return { hostTransport, roomCode, connectGuest, dispose };
}
