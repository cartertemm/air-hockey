import { describe, test, expect } from 'vitest';
import { playSound, playLoop, stopSound, updateLoop } from '../src/sound.js';

function makeFakePlayback() {
	return {
		playCalls: 0,
		stopCalls: 0,
		loopCalls: [],
		volume: 0,
		stereoPan: 0,
		sourceLoop: false,
		play() {
			this.playCalls++;
			return [this];
		},
		stop() {
			this.stopCalls++;
		},
		loop(value) {
			this.loopCalls.push(value);
		},
	};
}

function makeFakeHandle(playback = makeFakePlayback()) {
	return {
		playback,
		preplayCalls: 0,
		playCalls: 0,
		loopCalls: [],
		stopCalls: 0,
		preplay() {
			this.preplayCalls++;
			return [playback];
		},
		play() {
			this.playCalls++;
			return [playback];
		},
		loop(value) {
			this.loopCalls.push(value);
		},
		stop() {
			this.stopCalls++;
		},
	};
}

describe('sound helpers', () => {
	test('playSound uses preplay once and starts exactly one playback', () => {
		const handle = makeFakeHandle();
		const inst = playSound(handle, { volume: 0.7, pan: -0.25 });
		expect(inst).toBe(handle.playback);
		expect(handle.preplayCalls).toBe(1);
		expect(handle.playCalls).toBe(0);
		expect(handle.playback.playCalls).toBe(1);
		expect(handle.playback.volume).toBe(0.7);
		expect(handle.playback.stereoPan).toBe(-0.25);
	});

	test('playLoop enables looping on the playback instance and starts once', () => {
		const handle = makeFakeHandle();
		const inst = playLoop(handle, { volume: 0.35, pan: 0.5 });
		expect(inst.inst).toBe(handle.playback);
		expect(inst.handle).toBe(handle);
		expect(handle.preplayCalls).toBe(1);
		expect(handle.playCalls).toBe(0);
		expect(handle.loopCalls).toEqual(['infinite']);
		expect(handle.playback.playCalls).toBe(1);
		expect(handle.playback.volume).toBe(0.35);
		expect(handle.playback.stereoPan).toBe(0.5);
	});

	test('playLoop returns null when no loop playback can be created', () => {
		const handle = { loop() {}, preplay() { return []; } };
		expect(playLoop(handle)).toBe(null);
	});

	test('playLoop falls back to configuring the playback when handle.loop throws', () => {
		const playback = makeFakePlayback();
		const handle = {
			preplayCalls: 0,
			loop() {
				throw new Error('bad loop');
			},
			preplay() {
				this.preplayCalls++;
				return [playback];
			},
		};
		const inst = playLoop(handle, { volume: 0.4, pan: -0.2 });
		expect(inst.inst).toBe(playback);
		expect(handle.preplayCalls).toBe(1);
		expect(playback.loopCalls).toEqual(['infinite']);
		expect(playback.playCalls).toBe(1);
		expect(playback.volume).toBe(0.4);
		expect(playback.stereoPan).toBe(-0.2);
	});

	test('updateLoop mutates an existing playback without replaying it', () => {
		const handle = makeFakeHandle();
		const inst = playLoop(handle, { volume: 0.25, pan: -0.25 });
		updateLoop(inst, { volume: 0.9, pan: 0.1 });
		expect(handle.playback.playCalls).toBe(1);
		expect(handle.playback.volume).toBe(0.9);
		expect(handle.playback.stereoPan).toBe(0.1);
	});

	test('stopSound stops the playback instance exactly once', () => {
		const handle = makeFakeHandle();
		const inst = playLoop(handle);
		stopSound(inst);
		expect(handle.playback.stopCalls).toBe(1);
		expect(handle.stopCalls).toBe(1);
	});
});
