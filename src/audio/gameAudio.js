import { malletHitTier, wallBounceTier, goalTier } from './tiers.js';
import { speak } from '../speech.js';
import { TABLE_WIDTH } from '../physics.js';

import tableLoopUrl from '../../sounds/table_loop.ogg?url';
import puckLoopUrl from '../../sounds/puck_loop.ogg?url';
import hitPuck1Url from '../../sounds/hit_puck1.ogg?url';
import hitPuck2Url from '../../sounds/hit_puck2.ogg?url';
import hitPuck3Url from '../../sounds/hit_puck3.ogg?url';
import wallHardUrl from '../../sounds/puck_hit_side_hard.ogg?url';
import wallSoftUrl from '../../sounds/puck_hit_side_soft.ogg?url';
import goal1Url from '../../sounds/goal_1.ogg?url';
import goal2Url from '../../sounds/goal_2.ogg?url';
import goal3Url from '../../sounds/goal_3.ogg?url';
import goal4Url from '../../sounds/goal_4.ogg?url';
import goal5Url from '../../sounds/goal_5.ogg?url';
import offTableUrl from '../../sounds/puck_off_table.ogg?url';
import placePuckUrl from '../../sounds/place_puck.ogg?url';

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

const URLS = {
	tableLoop: tableLoopUrl,
	puckLoop: puckLoopUrl,
	hitPuck1: hitPuck1Url,
	hitPuck2: hitPuck2Url,
	hitPuck3: hitPuck3Url,
	wallHard: wallHardUrl,
	wallSoft: wallSoftUrl,
	goal1: goal1Url,
	goal2: goal2Url,
	goal3: goal3Url,
	goal4: goal4Url,
	goal5: goal5Url,
	offTable: offTableUrl,
	placePuck: placePuckUrl,
};

function panFor(localPlayer, tableX) {
	const centered = (tableX - TABLE_WIDTH / 2) / (TABLE_WIDTH / 2);
	return localPlayer === 'p1' ? centered : -centered;
}

export async function createGameAudio({ sound }) {
	await sound.initSound();
	const handles = {};
	for (const [key, url] of Object.entries(URLS)) {
		handles[key] = await sound.loadSound(url);
	}
	let tableLoopHandle = null;
	let puckLoopHandle = null;
	let localPlayer = 'p1';
	let active = false;

	function onEvent(event) {
		if (!active) return;
		switch (event.type) {
			case 'game:countdown':
				if (event.seconds === 0) speak('go', true);
				else speak(String(event.seconds), true);
				break;
			case 'puck:mallet_hit': {
				const key = `hitPuck${malletHitTier(event.speed)}`;
				sound.playSound(handles[key], { pan: panFor(localPlayer, event.x), volume: VOL[key] });
				break;
			}
			case 'puck:wall_bounce': {
				const key = wallBounceTier(event.speed) === 'hard' ? 'wallHard' : 'wallSoft';
				sound.playSound(handles[key], { pan: panFor(localPlayer, event.x), volume: VOL[key] });
				break;
			}
			case 'goal:scored': {
				const key = `goal${goalTier(event.puckSpeed ?? 0)}`;
				sound.playSound(handles[key], { volume: VOL[key] });
				break;
			}
			case 'puck:off_table':
				sound.playSound(handles.offTable, { volume: VOL.offTable });
				break;
			case 'serve:assigned':
				sound.playSound(handles.placePuck, { volume: VOL.placePuck });
				break;
			case 'match:end':
				if (event.winner) speak(`${event.winner} wins.`, true);
				break;
		}
	}

	function onSnapshot(snapshot) {
		if (!active) return;
		if (snapshot.state === 'COUNTDOWN' && !tableLoopHandle) {
			tableLoopHandle = sound.playLoop(handles.tableLoop, { volume: VOL.tableLoop });
		}
		if (snapshot.puck?.onTable && !puckLoopHandle) {
			puckLoopHandle = sound.playLoop(handles.puckLoop, {
				volume: VOL.puckLoop,
				pan: panFor(localPlayer, snapshot.puck.x),
			});
		}
		if (puckLoopHandle && snapshot.puck) {
			sound.updateLoop(puckLoopHandle, { pan: panFor(localPlayer, snapshot.puck.x) });
		}
		if (puckLoopHandle && !snapshot.puck?.onTable) {
			sound.stopSound(puckLoopHandle);
			puckLoopHandle = null;
		}
		if (snapshot.state === 'MATCH_END' && tableLoopHandle) {
			sound.stopSound(tableLoopHandle);
			tableLoopHandle = null;
		}
	}

	return {
		attach(game) {
			active = true;
			localPlayer = game.localPlayer ?? 'p1';
			game.on('gameStart', (msg) => {
				if (!active) return;
				localPlayer = msg.localPlayer;
			});
			game.on('event', onEvent);
			game.on('snapshot', onSnapshot);
		},
		dispose() {
			active = false;
			if (tableLoopHandle) {
				sound.stopSound(tableLoopHandle);
				tableLoopHandle = null;
			}
			if (puckLoopHandle) {
				sound.stopSound(puckLoopHandle);
				puckLoopHandle = null;
			}
		},
	};
}
