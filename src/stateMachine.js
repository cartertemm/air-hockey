export const State = {
	LOBBY: 'LOBBY',
	COUNTDOWN: 'COUNTDOWN',
	PLAYING: 'PLAYING',
	GOAL: 'GOAL',
	OFF_TABLE: 'OFF_TABLE',
	SERVE: 'SERVE',
	PAUSED: 'PAUSED',
	FORFEIT_CONFIRM: 'FORFEIT_CONFIRM',
	MATCH_END: 'MATCH_END',
};

// Mallet hit speed (in/s) required to end the SERVE state and begin PLAYING.
const SERVE_END_SPEED = 5;

export class GameStateMachine {
	constructor({ pointLimit = 7, bestOf = 1 } = {}, emitter = null) {
		this.state = State.LOBBY;
		this.pointLimit = pointLimit;
		this.bestOf = bestOf;
		this.emitter = emitter;
		this.scores = {
			p1: { points: 0, games: 0 },
			p2: { points: 0, games: 0 },
		};
		this.servingPlayer = null;
		this._stateBeforePause = null;
	}

	_transition(newState) {
		this.state = newState;
	}

	_emit(event, data) {
		this.emitter?.emit(event, data);
	}

	// Call when both players are ready to start. firstServer: 'p1' | 'p2'.
	startCountdown(firstServer) {
		if (this.state !== State.LOBBY) return;
		this.servingPlayer = firstServer;
		this._transition(State.COUNTDOWN);
		this._emit('game:start', { servingPlayer: firstServer });
	}

	// Call when the countdown finishes (COUNTDOWN), or after a goal/off-table
	// announcement is done (GOAL | OFF_TABLE) to hand the puck to the server.
	beginServe() {
		if (
			this.state !== State.COUNTDOWN &&
			this.state !== State.GOAL &&
			this.state !== State.OFF_TABLE
		) return;
		this._transition(State.SERVE);
		this._emit('serve:assigned', { player: this.servingPlayer });
	}

	// Call when physics emits puck:goal.
	handleGoal(scoredBy) {
		if (this.state !== State.PLAYING && this.state !== State.SERVE) return;

		this.scores[scoredBy].points++;
		this._transition(State.GOAL);
		this._emit('goal:scored', {
			scoredBy,
			p1Points: this.scores.p1.points,
			p2Points: this.scores.p2.points,
		});

		if (this.scores[scoredBy].points >= this.pointLimit) {
			this._handleGameWin(scoredBy);
			return;
		}

		// Scored-on player gets the serve
		this.servingPlayer = scoredBy === 'p1' ? 'p2' : 'p1';
	}

	_handleGameWin(winner) {
		this.scores[winner].games++;
		const gamesNeeded = Math.ceil(this.bestOf / 2);

		if (this.scores[winner].games >= gamesNeeded) {
			this._transition(State.MATCH_END);
			this._emit('match:end', {
				winner,
				p1Games: this.scores.p1.games,
				p2Games: this.scores.p2.games,
			});
			return;
		}

		// More games to play — reset points, loser serves
		this.scores.p1.points = 0;
		this.scores.p2.points = 0;
		this.servingPlayer = winner === 'p1' ? 'p2' : 'p1';
		this._emit('game:end', {
			winner,
			p1Games: this.scores.p1.games,
			p2Games: this.scores.p2.games,
		});
		// State stays GOAL; caller invokes beginServe() after announcing the game result.
	}

	// Call when physics emits puck:off_table.
	handleOffTable(lastTouchedBy) {
		if (this.state !== State.PLAYING && this.state !== State.SERVE) return;
		this.servingPlayer = lastTouchedBy === 'p1' ? 'p2' : 'p1';
		this._transition(State.OFF_TABLE);
		this._emit('puck:off_table', { lastTouchedBy });
	}

	// Call when physics emits puck:mallet_hit during SERVE state.
	// speed: the puck speed from the event payload.
	handlePuckStruck(speed) {
		if (this.state !== State.SERVE || speed < SERVE_END_SPEED) return;
		this._transition(State.PLAYING);
	}

	pause() {
		if (this.state !== State.PLAYING && this.state !== State.SERVE) return;
		this._stateBeforePause = this.state;
		this._transition(State.PAUSED);
		this._emit('game:paused');
	}

	resume() {
		if (this.state !== State.PAUSED) return;
		this._transition(this._stateBeforePause ?? State.PLAYING);
		this._emit('game:resumed');
	}

	// Can be requested from PLAYING or PAUSED.
	requestForfeit() {
		if (this.state !== State.PLAYING && this.state !== State.PAUSED) return;
		this._stateBeforePause = this.state;
		this._transition(State.FORFEIT_CONFIRM);
	}

	confirmForfeit(forfeitingPlayer) {
		if (this.state !== State.FORFEIT_CONFIRM) return;
		this._transition(State.MATCH_END);
		this._emit('forfeit:confirmed', { player: forfeitingPlayer });
	}

	denyForfeit() {
		if (this.state !== State.FORFEIT_CONFIRM) return;
		this._transition(this._stateBeforePause ?? State.PAUSED);
	}

	playerJoined(player, name) {
		this._emit('player:joined', { player, name });
	}

	playerLeft(player, name) {
		this._emit('player:left', { player, name });
	}

	// Triggered by 3-finger tap gesture.
	readScore() {
		this._emit('score:readout', {
			p1Points: this.scores.p1.points,
			p2Points: this.scores.p2.points,
		});
	}
}
