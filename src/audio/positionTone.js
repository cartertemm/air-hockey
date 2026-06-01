// A continuous oscillator whose pitch encodes the local player's position
// relative to the puck (lower = behind the puck, higher = in front). Routed
// through Cacophony's AudioContext so it shares the game's audio graph and
// autoplay-unlock. Pitch and pan are ramped briefly so position updates each
// tick don't produce zipper noise; gain fades on start/stop avoid clicks.

const RAMP_TIME_CONSTANT = 0.05;
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

export function createPositionTone({ type = 'triangle' } = {}) {
	let context = null;
	let oscillator = null;
	let gain = null;
	let panner = null;
	let playing = false;
	let epoch = 0;
	return {
		async play({ frequency = 330, pan = 0, volume = 0.08 } = {}) {
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
				oscillator = ctx.createOscillator();
				oscillator.type = type;
				oscillator.frequency.value = frequency;
				panner = ctx.createStereoPanner();
				panner.pan.value = pan;
				gain = ctx.createGain();
				const now = ctx.currentTime;
				gain.gain.setValueAtTime(0, now);
				gain.gain.linearRampToValueAtTime(volume, now + ATTACK_SEC);
				oscillator.connect(gain).connect(panner).connect(ctx.destination);
				oscillator.start();
			} catch (err) {
				console.warn('position tone play failed', err);
				playing = false;
			}
		},
		update({ frequency, pan } = {}) {
			if (!context) return;
			const now = context.currentTime;
			if (typeof frequency === 'number' && oscillator) {
				oscillator.frequency.setTargetAtTime(frequency, now, RAMP_TIME_CONSTANT);
			}
			if (typeof pan === 'number' && panner) {
				panner.pan.setTargetAtTime(pan, now, RAMP_TIME_CONSTANT);
			}
		},
		isPlaying() {
			return playing;
		},
		stop() {
			epoch++;
			playing = false;
			const osc = oscillator;
			const g = gain;
			const p = panner;
			const ctx = context;
			oscillator = null;
			gain = null;
			panner = null;
			context = null;
			if (!ctx || !osc) return;
			try {
				const now = ctx.currentTime;
				g.gain.cancelScheduledValues(now);
				g.gain.setValueAtTime(g.gain.value, now);
				g.gain.linearRampToValueAtTime(0, now + RELEASE_SEC);
				osc.stop(now + RELEASE_SEC + 0.01);
				osc.onended = () => {
					try {
						osc.disconnect();
						g.disconnect();
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
