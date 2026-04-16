import { describe, test, expect, vi } from 'vitest';
import { createGameAudio } from '../src/audio/gameAudio.js';

function createFakeGame() {
	const handlers = new Map();
	return {
		localPlayer: 'p1',
		on(event, handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => handlers.set(event, (handlers.get(event) ?? []).filter(fn => fn !== handler));
		},
		emit(event, payload) {
			for (const handler of handlers.get(event) ?? []) handler(payload);
		},
	};
}

function createFakeHandle(name) {
	return { name };
}

describe('game audio loops', () => {
	test('repeated snapshots only start each loop once until it is stopped', async () => {
		const playLoop = vi.fn((handle) => ({ handle, stop: vi.fn(), volume: 0, stereoPan: 0 }));
		const updateLoop = vi.fn();
		const stopSound = vi.fn((inst) => inst.stop());
		const sound = {
			initSound: vi.fn(async () => {}),
			loadSound: vi.fn(async (url) => createFakeHandle(url)),
			playLoop,
			updateLoop,
			stopSound,
			playSound: vi.fn(),
		};
		const audio = await createGameAudio({ sound });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: true, x: 24 },
		});
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: true, x: 30 },
		});
		expect(playLoop).toHaveBeenCalledTimes(2);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 40 },
		});
		expect(playLoop).toHaveBeenCalledTimes(2);
		expect(updateLoop).toHaveBeenCalledTimes(3);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: false, x: 40 },
		});
		expect(stopSound).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 50 },
		});
		expect(playLoop).toHaveBeenCalledTimes(3);
		game.emit('snapshot', {
			state: 'MATCH_END',
			puck: { onTable: false, x: 50 },
		});
		expect(stopSound).toHaveBeenCalledTimes(3);
	});

	test('table loop starts when audio attaches during active play', async () => {
		const playLoop = vi.fn((handle) => ({ handle, stop: vi.fn(), volume: 0, stereoPan: 0 }));
		const sound = {
			initSound: vi.fn(async () => {}),
			loadSound: vi.fn(async (url) => createFakeHandle(url)),
			playLoop,
			updateLoop: vi.fn(),
			stopSound: vi.fn(),
			playSound: vi.fn(),
		};
		const audio = await createGameAudio({ sound });
		const game = createFakeGame();
		game.localPlayer = 'p2';
		game.snapshot = {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
		};
		audio.attach(game);
		expect(playLoop).toHaveBeenCalledTimes(2);
	});

	test('table loop starts on gameStart before snapshots arrive', async () => {
		const playLoop = vi.fn((handle) => ({ handle, stop: vi.fn(), volume: 0, stereoPan: 0 }));
		const sound = {
			initSound: vi.fn(async () => {}),
			loadSound: vi.fn(async (url) => createFakeHandle(url)),
			playLoop,
			updateLoop: vi.fn(),
			stopSound: vi.fn(),
			playSound: vi.fn(),
		};
		const audio = await createGameAudio({ sound });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('gameStart', { localPlayer: 'p2', pointLimit: 7 });
		expect(playLoop).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: false, x: 24 },
		});
		expect(playLoop).toHaveBeenCalledTimes(1);
	});
});
