import { sfx } from '../sfx.js';
import { malletHitTier, wallBounceTier, goalTier } from './tiers.js';
import { speak } from '../speech.js';
import { TABLE_WIDTH } from '../physics.js';

const defaultSounds = {
	tableLoop:  sfx(() => import('../../sounds/table_loop.ogg?url')),
	puckLoop:   sfx(() => import('../../sounds/puck_loop.ogg?url')),
	hitPuck1:   sfx(() => import('../../sounds/hit_puck1.ogg?url')),
	hitPuck2:   sfx(() => import('../../sounds/hit_puck2.ogg?url')),
	hitPuck3:   sfx(() => import('../../sounds/hit_puck3.ogg?url')),
	wallHard:   sfx(() => import('../../sounds/puck_hit_side_hard.ogg?url')),
	wallSoft:   sfx(() => import('../../sounds/puck_hit_side_soft.ogg?url')),
	goal1:      sfx(() => import('../../sounds/goal_1.ogg?url')),
	goal2:      sfx(() => import('../../sounds/goal_2.ogg?url')),
	goal3:      sfx(() => import('../../sounds/goal_3.ogg?url')),
	goal4:      sfx(() => import('../../sounds/goal_4.ogg?url')),
	goal5:      sfx(() => import('../../sounds/goal_5.ogg?url')),
	offTable:   sfx(() => import('../../sounds/puck_off_table.ogg?url')),
	placePuck:  sfx(() => import('../../sounds/place_puck.ogg?url')),
};

const VOL = {
	tableLoop: 0.35,
	puckLoop: 0.6,
	hitPuck1: 1.0,
	hitPuck2: 0.85,
	hitPuck3: 0.7,
	wallHard: 1.0,
	wallSoft: 0.7,
	goal1: 1.0,
	goal2: 0.95,
	goal3: 0.9,
	goal4: 0.85,
	goal5: 0.8,
	offTable: 0.9,
	placePuck: 0.8,
};

function panFor(localPlayer, tableX) {
	const centered = (tableX - TABLE_WIDTH / 2) / (TABLE_WIDTH / 2);
	return localPlayer === 'p1' ? centered : -centered;
}

export async function preloadGameAudio() {
	await Promise.all(Object.values(defaultSounds).map(s => s.load()));
}

export function createGameAudio({ sounds = defaultSounds } = {}) {
	let localPlayer = 'p1';
	let active = false;
	let detachListeners = () => {};

	function shouldRunTableLoop(state) {
		return state === 'COUNTDOWN' || state === 'SERVE' || state === 'PLAYING' || state === 'PAUSED';
	}

	function ensureTableLoop() {
		if (!sounds.tableLoop.isLooping()) {
			sounds.tableLoop.play({ loop: 'infinite', volume: VOL.tableLoop });
		}
	}

	function onEvent(event) {
		if (!active) return;
		switch (event.type) {
			case 'game:countdown':
				if (event.seconds === 0) speak('go', true);
				else speak(String(event.seconds), true);
				break;
			case 'puck:mallet_hit': {
				const key = `hitPuck${malletHitTier(event.speed)}`;
				sounds[key].play({ pan: panFor(localPlayer, event.x), volume: VOL[key] });
				break;
			}
			case 'puck:wall_bounce': {
				const key = wallBounceTier(event.speed) === 'hard' ? 'wallHard' : 'wallSoft';
				sounds[key].play({ pan: panFor(localPlayer, event.x), volume: VOL[key] });
				break;
			}
			case 'goal:scored': {
				const key = `goal${goalTier(event.puckSpeed ?? 0)}`;
				sounds[key].play({ volume: VOL[key] });
				break;
			}
			case 'puck:off_table':
				sounds.offTable.play({ volume: VOL.offTable });
				break;
			case 'serve:assigned':
				sounds.placePuck.play({ volume: VOL.placePuck });
				break;
			case 'match:end':
				if (event.winner) speak(`${event.winner} wins.`, true);
				break;
		}
	}

	function onSnapshot(snapshot) {
		if (!active) return;
		if (shouldRunTableLoop(snapshot.state)) ensureTableLoop();
		if (snapshot.puck?.onTable) {
			if (!sounds.puckLoop.isLooping()) {
				sounds.puckLoop.play({
					loop: 'infinite',
					volume: VOL.puckLoop,
					pan: panFor(localPlayer, snapshot.puck.x),
				});
			} else {
				sounds.puckLoop.update({ pan: panFor(localPlayer, snapshot.puck.x) });
			}
		} else if (sounds.puckLoop.isLooping()) {
			sounds.puckLoop.stop();
		}
		if (snapshot.state === 'MATCH_END' && sounds.tableLoop.isLooping()) {
			sounds.tableLoop.stop();
		}
	}

	return {
		attach(game) {
			detachListeners();
			active = true;
			localPlayer = game.localPlayer ?? 'p1';
			const offGameStart = game.on('gameStart', (msg) => {
				if (!active) return;
				localPlayer = msg.localPlayer;
				ensureTableLoop();
			});
			const offEvent = game.on('event', onEvent);
			const offSnapshot = game.on('snapshot', onSnapshot);
			if (game.snapshot) onSnapshot(game.snapshot);
			detachListeners = () => {
				offGameStart?.();
				offEvent?.();
				offSnapshot?.();
				detachListeners = () => {};
			};
		},
		dispose() {
			active = false;
			detachListeners();
			sounds.tableLoop.stop();
			sounds.puckLoop.stop();
		},
	};
}
