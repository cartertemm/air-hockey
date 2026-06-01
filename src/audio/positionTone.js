// A continuous tone whose pitch encodes the local player's position relative
// to the puck (lower = behind the puck, higher = in front). When the puck sits
// behind the mallet (a nudge toward your own goal could score on yourself) the
// timbre warns by morphing from a soft triangle to a buzzier square wave. Both
// oscillators run continuously and are crossfaded by gain so the timbre shift
// is seamless rather than a hard switch. Routed through Cacophony's
// AudioContext so it shares the game's audio graph and autoplay-unlock. Pitch,
// pan, and crossfade are ramped so per-tick updates don't click or zipper.

const RAMP_TIME_CONSTANT = 0.05;
const CROSSFADE_TIME_CONSTANT = 0.04;
const ATTACK_SEC = 0.02;
const RELEASE_SEC = 0.03;

let contextPromise = null;
function loadContext() {
	if (contextPromise) return contextPromise;
	if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
		contextPromise = Promise.resolve(null);
		return contextPromise;
	}
	contextPromise = (async () => {
		const sound = await import('../sound.js');
		await sound.initSound();
		return sound.getCacophony()?.context ?? null;
	})();
	return contextPromise;
}

export function createPositionTone({ safeType = 'triangle', dangerType = 'square' } = {}) {
	let context = null;
	let safeOsc = null;
	let dangerOsc = null;
	let safeGain = null;
	let dangerGain = null;
	let masterGain = null;
	let panner = null;
	let playing = false;
	let epoch = 0;
	return {
		async play({ frequency = 330, pan = 0, volume = 0.08, danger = false } = {}) {
			if (playing) return;
			playing = true;
			const myEpoch = ++epoch;
			try {
				const ctx = await loadContext();
				if (!ctx || myEpoch !== epoch) {
					if (myEpoch === epoch) playing = false;
					return;
				}
				context = ctx;
				const now = ctx.currentTime;
				panner = ctx.createStereoPanner();
				panner.pan.value = pan;
				masterGain = ctx.createGain();
				masterGain.gain.setValueAtTime(0, now);
				masterGain.gain.linearRampToValueAtTime(volume, now + ATTACK_SEC);
				safeOsc = ctx.createOscillator();
				safeOsc.type = safeType;
				safeOsc.frequency.value = frequency;
				dangerOsc = ctx.createOscillator();
				dangerOsc.type = dangerType;
				dangerOsc.frequency.value = frequency;
				safeGain = ctx.createGain();
				dangerGain = ctx.createGain();
				safeGain.gain.value = danger ? 0 : 1;
				dangerGain.gain.value = danger ? 1 : 0;
				safeOsc.connect(safeGain).connect(masterGain);
				dangerOsc.connect(dangerGain).connect(masterGain);
				masterGain.connect(panner).connect(ctx.destination);
				safeOsc.start();
				dangerOsc.start();
			} catch (err) {
				console.warn('position tone play failed', err);
				playing = false;
			}
		},
		update({ frequency, pan, danger } = {}) {
			if (!context) return;
			const now = context.currentTime;
			if (typeof frequency === 'number') {
				safeOsc?.frequency.setTargetAtTime(frequency, now, RAMP_TIME_CONSTANT);
				dangerOsc?.frequency.setTargetAtTime(frequency, now, RAMP_TIME_CONSTANT);
			}
			if (typeof pan === 'number' && panner) {
				panner.pan.setTargetAtTime(pan, now, RAMP_TIME_CONSTANT);
			}
			if (typeof danger === 'boolean' && safeGain && dangerGain) {
				safeGain.gain.setTargetAtTime(danger ? 0 : 1, now, CROSSFADE_TIME_CONSTANT);
				dangerGain.gain.setTargetAtTime(danger ? 1 : 0, now, CROSSFADE_TIME_CONSTANT);
			}
		},
		isPlaying() {
			return playing;
		},
		stop() {
			epoch++;
			playing = false;
			const sOsc = safeOsc;
			const dOsc = dangerOsc;
			const sGain = safeGain;
			const dGain = dangerGain;
			const mGain = masterGain;
			const p = panner;
			const ctx = context;
			safeOsc = null;
			dangerOsc = null;
			safeGain = null;
			dangerGain = null;
			masterGain = null;
			panner = null;
			context = null;
			if (!ctx || !sOsc || !dOsc) return;
			try {
				const now = ctx.currentTime;
				mGain.gain.cancelScheduledValues(now);
				mGain.gain.setValueAtTime(mGain.gain.value, now);
				mGain.gain.linearRampToValueAtTime(0, now + RELEASE_SEC);
				const stopAt = now + RELEASE_SEC + 0.01;
				sOsc.stop(stopAt);
				dOsc.stop(stopAt);
				dOsc.onended = () => {
					try {
						sOsc.disconnect();
						dOsc.disconnect();
						sGain.disconnect();
						dGain.disconnect();
						mGain.disconnect();
						p.disconnect();
					} catch {
						/* already torn down */
					}
				};
			} catch {
				/* already stopped */
			}
		},
	};
}
