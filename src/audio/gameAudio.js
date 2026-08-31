import { audio } from '../audioEngine.js';
import { malletHitTier, wallBounceTier, goalTier } from './tiers.js';
import { speech } from '../speech.js';
import { TABLE_WIDTH, TABLE_LENGTH, MALLET_RADIUS } from '../physics.js';
import { lerp, range_convert } from 'audiogame-utils/math';

const defaultSounds = {
	tableLoop:          audio.sfx(() => import('../../sounds/table_loop.ogg?url')),
	puckLoop:           audio.sfx(() => import('../../sounds/puck_loop.ogg?url')),
	malletLoop:         audio.sfx(() => import('../../sounds/mallet_loop.ogg?url')),
	opponentMalletLoop: audio.sfx(() => import('../../sounds/opponent_mallet_loop.ogg?url')),
	hitPuck1:           audio.sfx(() => import('../../sounds/hit_puck1.ogg?url')),
	hitPuck2:           audio.sfx(() => import('../../sounds/hit_puck2.ogg?url')),
	hitPuck3:           audio.sfx(() => import('../../sounds/hit_puck3.ogg?url')),
	wallHard:           audio.sfx(() => import('../../sounds/puck_hit_side_hard.ogg?url')),
	wallSoft:           audio.sfx(() => import('../../sounds/puck_hit_side_soft.ogg?url')),
	goal1:              audio.sfx(() => import('../../sounds/goal_1.ogg?url')),
	goal2:              audio.sfx(() => import('../../sounds/goal_2.ogg?url')),
	goal3:              audio.sfx(() => import('../../sounds/goal_3.ogg?url')),
	goal4:              audio.sfx(() => import('../../sounds/goal_4.ogg?url')),
	goal5:              audio.sfx(() => import('../../sounds/goal_5.ogg?url')),
	offTable:           audio.sfx(() => import('../../sounds/puck_off_table.ogg?url')),
	placePuck:          audio.sfx(() => import('../../sounds/place_puck.ogg?url')),
	malletBorder:       audio.sfx(() => import('../../sounds/mallet_border.ogg?url')),
};

const TABLE_LOOP_START_PITCH = 0.5;
const TABLE_LOOP_RAMP_MS = 1000;

const VOL = {
	tableLoop: 0.35,
	puckLoop: 0.6,
	malletLoop: 0.5,
	opponentMalletLoop: 0.5,
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
	malletBorder: 1.0,
};

// Listener sits at the local player's goal end. Linear falloff with a 0.3 floor
// at the opposite end so far-away sounds remain audible for spatial awareness.
const DISTANCE_FALLOFF = 0.7;

function panFor(localPlayer, tableX) {
	const centered = range_convert(tableX, 0, TABLE_WIDTH, -1, 1);
	return localPlayer === 'p1' ? centered : -centered;
}

function distanceVolume(localPlayer, y) {
	if (typeof y !== 'number') return 1;
	const listenerY = localPlayer === 'p1' ? 0 : TABLE_LENGTH;
	const norm = Math.min(1, Math.abs(y - listenerY) / TABLE_LENGTH);
	return lerp(1, 1 - DISTANCE_FALLOFF, norm);
}

function malletAtBorder(mallet, player) {
	if (!mallet?.onTable) return false;
	if (mallet.x <= MALLET_RADIUS || mallet.x >= TABLE_WIDTH - MALLET_RADIUS) return true;
	return player === 'p1' ? mallet.y <= MALLET_RADIUS : mallet.y >= TABLE_LENGTH - MALLET_RADIUS;
}

export async function preloadGameAudio() {
	await audio.preload(Object.values(defaultSounds));
}

export function createGameAudio({ sounds = defaultSounds } = {}) {
	let localPlayer = 'p1';
	let active = false;
	let detachListeners = () => {};
	// The spin-up ramp is a one-shot startup effect, not a restart signal —
	// if the loop is killed (MATCH_END, externally) and comes back later,
	// it resumes at normal pitch.
	let tableLoopHasRamped = false;
	let malletBorderState = { p1: false, p2: false };

	function isActivePlay(state) {
		return state === 'SERVE' || state === 'PLAYING' || state === 'PAUSED';
	}

	function ensureTableLoop() {
		if (!sounds.tableLoop.isLooping()) {
			sounds.tableLoop.play({ loop: 'infinite', volume: VOL.tableLoop });
			if (!tableLoopHasRamped) {
				sounds.tableLoop.rampPitch({ from: TABLE_LOOP_START_PITCH, to: 1, durationMs: TABLE_LOOP_RAMP_MS });
				tableLoopHasRamped = true;
			}
		}
	}

	function onEvent(event) {
		if (!active) return;
		switch (event.type) {
			case 'game:countdown':
				if (event.seconds === 0) speech.speak('go', true);
				else speech.speak(String(event.seconds), true);
				break;
			case 'puck:mallet_hit': {
				const key = `hitPuck${malletHitTier(event.speed)}`;
				sounds[key].play({
					pan: panFor(localPlayer, event.x),
					volume: VOL[key] * distanceVolume(localPlayer, event.y),
				});
				break;
			}
			case 'puck:wall_bounce': {
				const key = wallBounceTier(event.speed) === 'hard' ? 'wallHard' : 'wallSoft';
				sounds[key].play({
					pan: panFor(localPlayer, event.x),
					volume: VOL[key] * distanceVolume(localPlayer, event.y),
				});
				break;
			}
			case 'goal:scored': {
				const key = `goal${goalTier(event.puckSpeed ?? 0)}`;
				sounds[key].play({ volume: VOL[key] });
				const you = localPlayer === 'p1' ? event.p1Points : event.p2Points;
				const opp = localPlayer === 'p1' ? event.p2Points : event.p1Points;
				const who = event.scoredBy === localPlayer ? 'You score' : 'Opponent scores';
				speech.speak(`${who}. ${you} to ${opp}.`, true);
				break;
			}
			case 'puck:off_table':
				sounds.offTable.play({ volume: VOL.offTable });
				speech.speak('Puck off table.', true);
				break;
			case 'serve:assigned':
				sounds.placePuck.play({ volume: VOL.placePuck });
				if (event.player) {
					speech.speak(event.player === localPlayer ? 'Your serve.' : 'Opponent\'s serve.', true);
				}
				break;
			case 'match:end':
				if (event.winner) speech.speak(event.winner === localPlayer ? 'You win.' : 'Opponent wins.', true);
				break;
			case 'game:end': {
				if (!event.winner) break;
				const you = localPlayer === 'p1' ? event.p1Games : event.p2Games;
				const opp = localPlayer === 'p1' ? event.p2Games : event.p1Games;
				const who = event.winner === localPlayer ? 'You win game' : 'Opponent wins game';
				speech.speak(`${who}. ${you} to ${opp}.`, true);
				break;
			}
			case 'forfeit:confirmed':
				speech.speak(event.player === localPlayer ? 'You forfeit.' : 'Opponent forfeits.', true);
				break;
			case 'game:paused':
				if (event.byPlayer === localPlayer) speech.speak('Game paused.', true);
				else speech.speak(`Game paused by ${event.byName}.`, true);
				break;
			case 'game:resumed':
				if (event.byPlayer === localPlayer) speech.speak('Game resumed.', true);
				else speech.speak(`Game resumed by ${event.byName}.`, true);
				break;
		}
	}

	function onSnapshot(snapshot) {
		if (!active) return;
		if (isActivePlay(snapshot.state)) ensureTableLoop();
		if (snapshot.puck?.onTable) {
			const puckVol = VOL.puckLoop * distanceVolume(localPlayer, snapshot.puck.y);
			const puckPan = panFor(localPlayer, snapshot.puck.x);
			if (!sounds.puckLoop.isLooping()) {
				sounds.puckLoop.play({ loop: 'infinite', volume: puckVol, pan: puckPan });
			} else {
				sounds.puckLoop.update({ pan: puckPan, volume: puckVol });
			}
		} else if (sounds.puckLoop.isLooping()) {
			sounds.puckLoop.stop();
		}
		const localMallet = snapshot.mallets?.[localPlayer];
		if (isActivePlay(snapshot.state) && localMallet?.onTable) {
			const vol = VOL.malletLoop * distanceVolume(localPlayer, localMallet.y);
			const pan = panFor(localPlayer, localMallet.x);
			if (!sounds.malletLoop.isLooping()) {
				sounds.malletLoop.play({ loop: 'infinite', volume: vol, pan });
			} else {
				sounds.malletLoop.update({ pan, volume: vol });
			}
		} else if (sounds.malletLoop.isLooping()) {
			sounds.malletLoop.stop();
		}
		const opponent = localPlayer === 'p1' ? 'p2' : 'p1';
		const opponentMallet = snapshot.mallets?.[opponent];
		if (isActivePlay(snapshot.state) && opponentMallet?.onTable) {
			const vol = VOL.opponentMalletLoop * distanceVolume(localPlayer, opponentMallet.y);
			const pan = panFor(localPlayer, opponentMallet.x);
			if (!sounds.opponentMalletLoop.isLooping()) {
				sounds.opponentMalletLoop.play({ loop: 'infinite', volume: vol, pan });
			} else {
				sounds.opponentMalletLoop.update({ pan, volume: vol });
			}
		} else if (sounds.opponentMalletLoop.isLooping()) {
			sounds.opponentMalletLoop.stop();
		}
		if (snapshot.state === 'MATCH_END' && sounds.tableLoop.isLooping()) {
			sounds.tableLoop.stop();
		}
		if (isActivePlay(snapshot.state)) {
			for (const player of ['p1', 'p2']) {
				const atBorder = malletAtBorder(snapshot.mallets?.[player], player);
				if (atBorder && !malletBorderState[player]) {
					sounds.malletBorder.play({ volume: VOL.malletBorder });
				}
				malletBorderState[player] = atBorder;
			}
		} else {
			malletBorderState.p1 = false;
			malletBorderState.p2 = false;
		}
	}

	return {
		attach(game) {
			detachListeners();
			active = true;
			localPlayer = game.localPlayer ?? 'p1';
			malletBorderState = { p1: false, p2: false };
			const offGameStart = game.on('gameStart', (msg) => {
				if (!active) return;
				localPlayer = msg.localPlayer;
			});
			const offEvent = game.on('event', onEvent);
			const offSnapshot = game.on('snapshot', onSnapshot);
			const offGameEnd = game.on('gameEnd', (msg) => {
				if (!active || !msg?.finalScore) return;
				const you = localPlayer === 'p1' ? msg.finalScore.p1 : msg.finalScore.p2;
				const opp = localPlayer === 'p1' ? msg.finalScore.p2 : msg.finalScore.p1;
				speech.speak(`Final score: you ${you}, opponent ${opp}.`, true);
			});
			if (game.snapshot) onSnapshot(game.snapshot);
			detachListeners = () => {
				offGameStart?.();
				offEvent?.();
				offSnapshot?.();
				offGameEnd?.();
				detachListeners = () => {};
			};
		},
		dispose() {
			active = false;
			detachListeners();
			sounds.tableLoop.stop();
			sounds.puckLoop.stop();
			sounds.malletLoop.stop();
			sounds.opponentMalletLoop.stop();
		},
	};
}
