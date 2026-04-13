import { describe, test, expect } from 'vitest';
import { GameStateMachine, State } from '../src/stateMachine.js';

function mockEmitter() {
	const events = [];
	return {
		events,
		emit(name, data) { events.push({ name, data }); },
		emitted(name) { return events.filter(e => e.name === name); },
	};
}

function makeSM(config = {}, emitter = null) {
	return new GameStateMachine(config, emitter);
}

// ─── Initial state ───────────────────────────────────────────────────────────

describe('initial state', () => {
	test('starts in LOBBY', () => {
		expect(makeSM().state).toBe(State.LOBBY);
	});

	test('scores start at zero', () => {
		const sm = makeSM();
		expect(sm.scores.p1).toEqual({ points: 0, games: 0 });
		expect(sm.scores.p2).toEqual({ points: 0, games: 0 });
	});
});

// ─── LOBBY → COUNTDOWN → SERVE → PLAYING ─────────────────────────────────────

describe('startup sequence', () => {
	test('startCountdown transitions LOBBY → COUNTDOWN', () => {
		const sm = makeSM();
		sm.startCountdown('p1');
		expect(sm.state).toBe(State.COUNTDOWN);
	});

	test('startCountdown emits game:start with serving player', () => {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.startCountdown('p2');
		const events = em.emitted('game:start');
		expect(events).toHaveLength(1);
		expect(events[0].data.servingPlayer).toBe('p2');
	});

	test('startCountdown ignored outside LOBBY', () => {
		const sm = makeSM();
		sm.startCountdown('p1');
		sm.startCountdown('p2'); // should be ignored
		expect(sm.servingPlayer).toBe('p1');
	});

	test('beginServe from COUNTDOWN → SERVE', () => {
		const sm = makeSM();
		sm.startCountdown('p1');
		sm.beginServe();
		expect(sm.state).toBe(State.SERVE);
	});

	test('beginServe emits serve:assigned', () => {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.startCountdown('p1');
		sm.beginServe();
		const events = em.emitted('serve:assigned');
		expect(events).toHaveLength(1);
		expect(events[0].data.player).toBe('p1');
	});

	test('handlePuckStruck above threshold in SERVE → PLAYING', () => {
		const sm = makeSM();
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		expect(sm.state).toBe(State.PLAYING);
	});

	test('handlePuckStruck below threshold stays in SERVE', () => {
		const sm = makeSM();
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(1);
		expect(sm.state).toBe(State.SERVE);
	});
});

// ─── Goals ───────────────────────────────────────────────────────────────────

describe('goal handling', () => {
	function playingState(config = {}) {
		const em = mockEmitter();
		const sm = makeSM(config, em);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		em.events.length = 0; // clear startup noise
		return { sm, em };
	}

	test('goal increments scorer\'s points', () => {
		const { sm } = playingState();
		sm.handleGoal('p1');
		expect(sm.scores.p1.points).toBe(1);
	});

	test('goal transitions to GOAL state', () => {
		const { sm } = playingState();
		sm.handleGoal('p1');
		expect(sm.state).toBe(State.GOAL);
	});

	test('goal emits goal:scored with updated scores', () => {
		const { sm, em } = playingState();
		sm.handleGoal('p2');
		const events = em.emitted('goal:scored');
		expect(events).toHaveLength(1);
		expect(events[0].data).toMatchObject({ scoredBy: 'p2', p1Points: 0, p2Points: 1 });
	});

	test('scored-on player gets the serve', () => {
		const { sm } = playingState();
		sm.handleGoal('p1'); // p1 scored, so p2 serves
		expect(sm.servingPlayer).toBe('p2');
	});

	test('beginServe after goal → SERVE', () => {
		const { sm } = playingState();
		sm.handleGoal('p1');
		sm.beginServe();
		expect(sm.state).toBe(State.SERVE);
	});

	test('goal ignored outside PLAYING/SERVE', () => {
		const sm = makeSM();
		sm.handleGoal('p1'); // in LOBBY — should be ignored
		expect(sm.scores.p1.points).toBe(0);
		expect(sm.state).toBe(State.LOBBY);
	});
});

// ─── Game win ────────────────────────────────────────────────────────────────

describe('game win', () => {
	function nearWin(pointLimit = 7) {
		const em = mockEmitter();
		const sm = makeSM({ pointLimit }, em);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		// Score pointLimit - 1 goals
		for (let i = 0; i < pointLimit - 1; i++) {
			sm.handleGoal('p1');
			em.events.length = 0;
			sm.beginServe();
			sm.handlePuckStruck(10);
		}
		em.events.length = 0;
		return { sm, em };
	}

	test('reaching point limit ends game (single match)', () => {
		const { sm } = nearWin(7);
		sm.handleGoal('p1');
		expect(sm.state).toBe(State.MATCH_END);
	});

	test('match:end emitted with winner', () => {
		const { sm, em } = nearWin(7);
		sm.handleGoal('p1');
		const events = em.emitted('match:end');
		expect(events).toHaveLength(1);
		expect(events[0].data.winner).toBe('p1');
	});

	test('best-of-3: first game win increments games, not match end', () => {
		const { sm } = nearWin(7);
		const sm3 = new GameStateMachine({ pointLimit: 7, bestOf: 3 }, null);
		sm3.startCountdown('p1');
		sm3.beginServe();
		sm3.handlePuckStruck(10);
		for (let i = 0; i < 7; i++) {
			sm3.handleGoal('p1');
			if (sm3.state === State.GOAL) {
				sm3.beginServe();
				sm3.handlePuckStruck(10);
			}
		}
		expect(sm3.scores.p1.games).toBe(1);
		expect(sm3.state).not.toBe(State.MATCH_END);
	});

	test('best-of-3: two game wins ends match', () => {
		const sm = new GameStateMachine({ pointLimit: 7, bestOf: 3 }, null);
		for (let game = 0; game < 2; game++) {
			sm.startCountdown('p1');
			sm.beginServe();
			sm.handlePuckStruck(10);
			for (let i = 0; i < 7; i++) {
				sm.handleGoal('p1');
				if (sm.state === State.GOAL) {
					sm.beginServe();
					sm.handlePuckStruck(10);
				}
			}
		}
		expect(sm.state).toBe(State.MATCH_END);
		expect(sm.scores.p1.games).toBe(2);
	});

	test('best-of-3: points reset between games', () => {
		const sm = new GameStateMachine({ pointLimit: 7, bestOf: 3 }, null);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		for (let i = 0; i < 7; i++) {
			sm.handleGoal('p1');
			if (sm.state === State.GOAL) {
				sm.beginServe();
				sm.handlePuckStruck(10);
			}
		}
		// After game 1 ends, points should reset
		expect(sm.scores.p1.points).toBe(0);
		expect(sm.scores.p2.points).toBe(0);
	});
});

// ─── Off table ───────────────────────────────────────────────────────────────

describe('off table', () => {
	function inPlaying() {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		em.events.length = 0;
		return { sm, em };
	}

	test('handleOffTable transitions to OFF_TABLE', () => {
		const { sm } = inPlaying();
		sm.handleOffTable('p1');
		expect(sm.state).toBe(State.OFF_TABLE);
	});

	test('opponent of last toucher gets the serve', () => {
		const { sm } = inPlaying();
		sm.handleOffTable('p1'); // p1 sent it off, so p2 serves
		expect(sm.servingPlayer).toBe('p2');
	});

	test('emits puck:off_table', () => {
		const { sm, em } = inPlaying();
		sm.handleOffTable('p2');
		expect(em.emitted('puck:off_table')).toHaveLength(1);
	});

	test('beginServe from OFF_TABLE → SERVE', () => {
		const { sm } = inPlaying();
		sm.handleOffTable('p1');
		sm.beginServe();
		expect(sm.state).toBe(State.SERVE);
	});
});

// ─── Pause / Resume ───────────────────────────────────────────────────────────

describe('pause and resume', () => {
	function inPlaying() {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		em.events.length = 0;
		return { sm, em };
	}

	test('pause transitions PLAYING → PAUSED', () => {
		const { sm } = inPlaying();
		sm.pause();
		expect(sm.state).toBe(State.PAUSED);
	});

	test('pause emits game:paused', () => {
		const { sm, em } = inPlaying();
		sm.pause();
		expect(em.emitted('game:paused')).toHaveLength(1);
	});

	test('pause ignored outside PLAYING', () => {
		const sm = makeSM();
		sm.pause(); // in LOBBY
		expect(sm.state).toBe(State.LOBBY);
	});

	test('resume transitions PAUSED → PLAYING', () => {
		const { sm } = inPlaying();
		sm.pause();
		sm.resume();
		expect(sm.state).toBe(State.PLAYING);
	});

	test('resume emits game:resumed', () => {
		const { sm, em } = inPlaying();
		sm.pause();
		em.events.length = 0;
		sm.resume();
		expect(em.emitted('game:resumed')).toHaveLength(1);
	});

	test('resume ignored outside PAUSED', () => {
		const { sm } = inPlaying();
		sm.resume(); // in PLAYING, not PAUSED
		expect(sm.state).toBe(State.PLAYING);
	});
});

// ─── Forfeit ──────────────────────────────────────────────────────────────────

describe('forfeit', () => {
	function inPlaying() {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.startCountdown('p1');
		sm.beginServe();
		sm.handlePuckStruck(10);
		em.events.length = 0;
		return { sm, em };
	}

	test('requestForfeit from PLAYING → FORFEIT_CONFIRM', () => {
		const { sm } = inPlaying();
		sm.requestForfeit();
		expect(sm.state).toBe(State.FORFEIT_CONFIRM);
	});

	test('requestForfeit from PAUSED → FORFEIT_CONFIRM', () => {
		const { sm } = inPlaying();
		sm.pause();
		sm.requestForfeit();
		expect(sm.state).toBe(State.FORFEIT_CONFIRM);
	});

	test('requestForfeit ignored outside PLAYING/PAUSED', () => {
		const sm = makeSM();
		sm.requestForfeit();
		expect(sm.state).toBe(State.LOBBY);
	});

	test('confirmForfeit → MATCH_END, emits forfeit:confirmed', () => {
		const { sm, em } = inPlaying();
		sm.requestForfeit();
		sm.confirmForfeit('p2');
		expect(sm.state).toBe(State.MATCH_END);
		const events = em.emitted('forfeit:confirmed');
		expect(events).toHaveLength(1);
		expect(events[0].data.player).toBe('p2');
	});

	test('denyForfeit returns to PLAYING when forfeit was from PLAYING', () => {
		const { sm } = inPlaying();
		sm.requestForfeit();
		sm.denyForfeit();
		expect(sm.state).toBe(State.PLAYING);
	});

	test('denyForfeit returns to PAUSED when forfeit was from PAUSED', () => {
		const { sm } = inPlaying();
		sm.pause();
		sm.requestForfeit();
		sm.denyForfeit();
		expect(sm.state).toBe(State.PAUSED);
	});
});

// ─── Score readout ────────────────────────────────────────────────────────────

describe('score readout', () => {
	test('readScore emits score:readout with current scores', () => {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.scores.p1.points = 3;
		sm.scores.p2.points = 5;
		sm.readScore();
		const events = em.emitted('score:readout');
		expect(events).toHaveLength(1);
		expect(events[0].data).toEqual({ p1Points: 3, p2Points: 5 });
	});
});

// ─── Player join/leave ────────────────────────────────────────────────────────

describe('player events', () => {
	test('playerJoined emits player:joined', () => {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.playerJoined('p1', 'Alice');
		const events = em.emitted('player:joined');
		expect(events).toHaveLength(1);
		expect(events[0].data).toEqual({ player: 'p1', name: 'Alice' });
	});

	test('playerLeft emits player:left', () => {
		const em = mockEmitter();
		const sm = makeSM({}, em);
		sm.playerLeft('p2', 'Bob');
		const events = em.emitted('player:left');
		expect(events).toHaveLength(1);
		expect(events[0].data).toEqual({ player: 'p2', name: 'Bob' });
	});
});
