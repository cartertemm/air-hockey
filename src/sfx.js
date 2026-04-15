// Wraps an audio asset behind a minimal play/stop/load API. Cacophony, the
// AudioContext, and the .ogg ?url asset are all loaded lazily on first use,
// so importing this file is safe in tests without an AudioContext.
// play({loop:'infinite'}) is idempotent: calling again while already looping
// is a no-op. stop() halts the current playback.

let modulePromise = null;
function loadModule() {
	if (modulePromise) return modulePromise;
	if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
		modulePromise = Promise.resolve(null);
		return modulePromise;
	}
	modulePromise = (async () => {
		const sound = await import('./sound.js');
		await sound.initSound();
		return sound;
	})();
	return modulePromise;
}

export function sfx(urlImporter) {
	let handlePromise = null;
	let playing = false;
	let epoch = 0;
	function ensureLoaded() {
		if (!handlePromise) {
			handlePromise = (async () => {
				const sound = await loadModule();
				if (!sound) return null;
				const urlMod = await urlImporter();
				return { sound, handle: await sound.loadSound(urlMod.default) };
			})();
		}
		return handlePromise;
	}
	return {
		async play(options = {}) {
			const myEpoch = ++epoch;
			try {
				const loaded = await ensureLoaded();
				if (myEpoch !== epoch || !loaded) return;
				if (options.loop && playing) return;
				playing = true;
				loaded.sound.playSound(loaded.handle, options);
			} catch (err) {
				console.warn('sfx play failed', err);
				handlePromise = null;
				if (myEpoch === epoch) playing = false;
			}
		},
		async stop() {
			epoch++;
			playing = false;
			if (!handlePromise) return;
			try {
				const loaded = await handlePromise;
				loaded?.sound.stopSound(loaded.handle);
			} catch {
				/* ignore */
			}
		},
		load: ensureLoaded,
	};
}
