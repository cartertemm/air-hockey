import { describe, test, expect } from 'vitest';
import { playSound, stopSound } from '../src/sound.js';

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

	test('stopSound stops the playback instance exactly once', () => {
		const handle = makeFakeHandle();
		const inst = playSound(handle);
		stopSound(inst);
		expect(inst.stopCalls).toBe(1);
	});
});
