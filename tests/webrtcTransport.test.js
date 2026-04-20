import { describe, test, expect, vi } from 'vitest';
import { WebRTCTransport } from '../network/webrtcTransport.js';

function makeFakeChannel() {
	return {
		send: vi.fn(),
		close: vi.fn(),
		onmessage: null,
		onclose: null,
		readyState: 'open',
	};
}

function makeFakePc() {
	return { close: vi.fn() };
}

describe('WebRTCTransport', () => {
	test('send() serializes message as JSON', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		transport.send({ type: 'ping', x: 1 });
		expect(channel.send).toHaveBeenCalledOnce();
		expect(JSON.parse(channel.send.mock.calls[0][0])).toEqual({ type: 'ping', x: 1 });
	});

	test('onMessage handler receives parsed message objects', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		const received = [];
		transport.onMessage(msg => received.push(msg));
		channel.onmessage({ data: JSON.stringify({ type: 'snap', tick: 42 }) });
		expect(received).toEqual([{ type: 'snap', tick: 42 }]);
	});

	test('onMessage handler can be registered after construction', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		const received = [];
		transport.onMessage(msg => received.push(msg));
		channel.onmessage({ data: JSON.stringify({ type: 'go' }) });
		expect(received).toEqual([{ type: 'go' }]);
	});

	test('onMessage not yet set — message silently dropped', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		expect(() => channel.onmessage({ data: JSON.stringify({ type: 'early' }) })).not.toThrow();
	});

	test('onClose handler fires when channel closes', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		let closed = false;
		transport.onClose(() => { closed = true; });
		channel.onclose();
		expect(closed).toBe(true);
	});

	test('onClose not yet set — close event silently dropped', () => {
		const channel = makeFakeChannel();
		const transport = new WebRTCTransport(channel, makeFakePc());
		expect(() => channel.onclose()).not.toThrow();
	});

	test('close() closes both the channel and peer connection', () => {
		const channel = makeFakeChannel();
		const pc = makeFakePc();
		const transport = new WebRTCTransport(channel, pc);
		transport.close();
		expect(channel.close).toHaveBeenCalledOnce();
		expect(pc.close).toHaveBeenCalledOnce();
	});
});
