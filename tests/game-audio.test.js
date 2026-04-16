import { describe, test, expect, vi } from 'vitest';
import { createGameAudio } from '../src/audio/gameAudio.js';

function createFakeGame() {
	const handlers = new Map();
	return {
		localPlayer: 'p1',
		snapshot: null,
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

function fakeSfx() {
	let looping = false;
	const fake = {
		play: vi.fn((options = {}) => {
			if (options.loop) looping = true;
		}),
		stop: vi.fn(() => {
			looping = false;
		}),
		update: vi.fn(),
		isLooping: vi.fn(() => looping),
		load: vi.fn(async () => {}),
	};
	return fake;
}

function makeSounds() {
	return {
		tableLoop: fakeSfx(),
		puckLoop: fakeSfx(),
		malletLoop: fakeSfx(),
		hitPuck1: fakeSfx(),
		hitPuck2: fakeSfx(),
		hitPuck3: fakeSfx(),
		wallHard: fakeSfx(),
		wallSoft: fakeSfx(),
		goal1: fakeSfx(),
		goal2: fakeSfx(),
		goal3: fakeSfx(),
		goal4: fakeSfx(),
		goal5: fakeSfx(),
		offTable: fakeSfx(),
		placePuck: fakeSfx(),
	};
}

describe('game audio loops', () => {
	test('repeated snapshots only start each loop once until it is stopped', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: true, x: 24 },
		});
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.play).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: true, x: 30 },
		});
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.update).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 40 },
		});
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.update).toHaveBeenCalledTimes(2);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: false, x: 40 },
		});
		expect(sounds.puckLoop.stop).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 50 },
		});
		expect(sounds.puckLoop.play).toHaveBeenCalledTimes(2);
		game.emit('snapshot', {
			state: 'MATCH_END',
			puck: { onTable: false, x: 50 },
		});
		expect(sounds.puckLoop.stop).toHaveBeenCalledTimes(2);
		expect(sounds.tableLoop.stop).toHaveBeenCalledTimes(1);
	});

	test('table loop starts when audio attaches during active play', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		game.localPlayer = 'p2';
		game.snapshot = {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
		};
		audio.attach(game);
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.play).toHaveBeenCalledTimes(1);
	});

	test('table loop starts on gameStart before snapshots arrive', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('gameStart', { localPlayer: 'p2', pointLimit: 7 });
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'COUNTDOWN',
			puck: { onTable: false, x: 24 },
		});
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
	});

	test('mallet loop tracks local mallet x and stops when off-table or outside gameplay', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('gameStart', { localPlayer: 'p1', pointLimit: 7 });
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
			mallets: { p1: { x: 10, onTable: true }, p2: { x: 30, onTable: true } },
		});
		expect(sounds.malletLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.malletLoop.play).toHaveBeenCalledWith(expect.objectContaining({
			loop: 'infinite',
			volume: 0.5,
		}));
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
			mallets: { p1: { x: 20, onTable: true }, p2: { x: 30, onTable: true } },
		});
		expect(sounds.malletLoop.play).toHaveBeenCalledTimes(1);
		expect(sounds.malletLoop.update).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
			mallets: { p1: { x: 20, onTable: false }, p2: { x: 30, onTable: true } },
		});
		expect(sounds.malletLoop.stop).toHaveBeenCalledTimes(1);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
			mallets: { p1: { x: 20, onTable: true }, p2: { x: 30, onTable: true } },
		});
		expect(sounds.malletLoop.play).toHaveBeenCalledTimes(2);
		game.emit('snapshot', {
			state: 'MATCH_END',
			puck: { onTable: false, x: 24 },
			mallets: { p1: { x: 20, onTable: true }, p2: { x: 30, onTable: true } },
		});
		expect(sounds.malletLoop.stop).toHaveBeenCalledTimes(2);
	});

	test('externally killed loop can be restarted', () => {
		const sounds = makeSounds();
		// Override tableLoop isLooping to simulate external kill
		let tableLoopExternalState = false;
		sounds.tableLoop.play = vi.fn(() => { tableLoopExternalState = true; });
		sounds.tableLoop.isLooping = vi.fn(() => tableLoopExternalState);
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('gameStart', { localPlayer: 'p1', pointLimit: 7 });
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(1);
		// Simulate external kill (audio engine stops the loop)
		tableLoopExternalState = false;
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: false, x: 24 },
		});
		expect(sounds.tableLoop.play).toHaveBeenCalledTimes(2);
	});
});

describe('game audio one-shots', () => {
	test('mallet hit plays the correct tier sound with pan', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('event', { type: 'puck:mallet_hit', x: 0, speed: 100 });
		expect(sounds.hitPuck1.play).toHaveBeenCalledWith(
			expect.objectContaining({ volume: 1.0 }),
		);
		game.emit('event', { type: 'puck:mallet_hit', x: 24, speed: 50 });
		expect(sounds.hitPuck2.play).toHaveBeenCalledTimes(1);
		game.emit('event', { type: 'puck:mallet_hit', x: 24, speed: 10 });
		expect(sounds.hitPuck3.play).toHaveBeenCalledTimes(1);
	});

	test('wall bounce plays hard or soft based on speed', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('event', { type: 'puck:wall_bounce', x: 0, speed: 80 });
		expect(sounds.wallHard.play).toHaveBeenCalledTimes(1);
		game.emit('event', { type: 'puck:wall_bounce', x: 0, speed: 30 });
		expect(sounds.wallSoft.play).toHaveBeenCalledTimes(1);
	});

	test('goal scored plays tiered goal sound', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('event', { type: 'goal:scored', puckSpeed: 130 });
		expect(sounds.goal1.play).toHaveBeenCalledTimes(1);
	});

	test('off_table and serve:assigned play their sounds', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('event', { type: 'puck:off_table' });
		expect(sounds.offTable.play).toHaveBeenCalledTimes(1);
		game.emit('event', { type: 'serve:assigned' });
		expect(sounds.placePuck.play).toHaveBeenCalledTimes(1);
	});
});

describe('game audio dispose', () => {
	test('dispose stops both loops', () => {
		const sounds = makeSounds();
		const audio = createGameAudio({ sounds });
		const game = createFakeGame();
		audio.attach(game);
		game.emit('snapshot', {
			state: 'PLAYING',
			puck: { onTable: true, x: 24 },
		});
		audio.dispose();
		expect(sounds.tableLoop.stop).toHaveBeenCalledTimes(1);
		expect(sounds.puckLoop.stop).toHaveBeenCalledTimes(1);
		expect(sounds.malletLoop.stop).toHaveBeenCalledTimes(1);
	});
});
