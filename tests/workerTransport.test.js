import { describe, test, expect, beforeEach } from 'vitest';
import { WorkerTransport } from '../network/workerTransport.js';

function makeFakeWorker() {
	const listeners = [];
	return {
		posted: [],
		terminated: false,
		postMessage(data) { this.posted.push(data); },
		terminate() { this.terminated = true; },
		addEventListener(type, fn) { listeners.push({ type, fn }); },
		removeEventListener(type, fn) {
			const idx = listeners.findIndex(l => l.fn === fn);
			if (idx !== -1) listeners.splice(idx, 1);
		},
		emit(data) {
			for (const l of listeners) {
				if (l.type === 'message') l.fn({ data });
			}
		},
		_listenerCount() { return listeners.length; },
	};
}

describe('WorkerTransport', () => {
	let worker;

	beforeEach(() => {
		worker = makeFakeWorker();
	});

	test('send() posts message with target tag', () => {
		const t = new WorkerTransport(worker, 'p1');
		t.send({ type: 'input', x: 1, y: 2 });
		expect(worker.posted).toEqual([{ target: 'p1', msg: { type: 'input', x: 1, y: 2 } }]);
	});

	test('onMessage fires when worker emits matching target', () => {
		const t = new WorkerTransport(worker, 'p1');
		const received = [];
		t.onMessage(msg => received.push(msg));
		worker.emit({ target: 'p1', msg: { type: 'snapshot' } });
		expect(received).toEqual([{ type: 'snapshot' }]);
	});

	test('onMessage does not fire for a different target', () => {
		const t = new WorkerTransport(worker, 'p1');
		const received = [];
		t.onMessage(msg => received.push(msg));
		worker.emit({ target: 'p2', msg: { type: 'snapshot' } });
		expect(received).toHaveLength(0);
	});

	test('close() terminates the worker', () => {
		const t = new WorkerTransport(worker, 'p1');
		t.close();
		expect(worker.terminated).toBe(true);
	});

	test('close() removes the message listener', () => {
		const t = new WorkerTransport(worker, 'p1');
		expect(worker._listenerCount()).toBe(1);
		t.close();
		expect(worker._listenerCount()).toBe(0);
	});

	test('close() calls onClose handler', () => {
		const t = new WorkerTransport(worker, 'p1');
		let closed = false;
		t.onClose(() => { closed = true; });
		t.close();
		expect(closed).toBe(true);
	});

	test('p1 and p2 transports on same worker are independent', () => {
		const t1 = new WorkerTransport(worker, 'p1');
		const t2 = new WorkerTransport(worker, 'p2');
		const r1 = [], r2 = [];
		t1.onMessage(m => r1.push(m));
		t2.onMessage(m => r2.push(m));
		worker.emit({ target: 'p1', msg: { type: 'a' } });
		worker.emit({ target: 'p2', msg: { type: 'b' } });
		expect(r1).toEqual([{ type: 'a' }]);
		expect(r2).toEqual([{ type: 'b' }]);
	});

	test('send uses correct target tag for p2', () => {
		const t = new WorkerTransport(worker, 'p2');
		t.send({ type: 'pause:toggle' });
		expect(worker.posted[0].target).toBe('p2');
	});
});
