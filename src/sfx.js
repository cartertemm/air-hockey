// Wraps an audio asset behind a minimal play/stop/load/setPosition API.
// Cacophony, the AudioContext, and the .ogg ?url asset are all loaded lazily
// on first use, so importing this file is safe in tests without an
// AudioContext. play({loop:'infinite'}) is idempotent: calling again while
// already looping is a no-op. play() accepts {position:[x,y,z]} for the
// initial 3D position; setPosition() updates position on a sound that's
// already loaded or playing (e.g. tracking a moving puck).

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
	let looping = false;
	let epoch = 0;
	let currentInst = null;
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
				if (options.loop) {
					if (looping && currentInst?.isPlaying !== false) return;
					looping = true;
				}
				currentInst = loaded.sound.playSound(loaded.handle, options);
			} catch (err) {
				console.warn('sfx play failed', err);
				handlePromise = null;
				if (myEpoch === epoch && options.loop) looping = false;
			}
		},
		isLooping() {
			return looping && currentInst?.isPlaying !== false;
		},
		async stop() {
			epoch++;
			looping = false;
			const inst = currentInst;
			currentInst = null;
			if (inst) {
				inst.stop?.();
			}
			if (!handlePromise) return;
			try {
				const loaded = await handlePromise;
				loaded?.sound.stopSound(loaded.handle);
			} catch {
				/* ignore */
			}
		},
		update(options = {}) {
			if (!currentInst) return;
			if (typeof options.pan === 'number') currentInst.stereoPan = options.pan;
			if (typeof options.volume === 'number') currentInst.volume = options.volume;
		},
		async setPosition(position) {
			try {
				const loaded = await ensureLoaded();
				if (loaded) loaded.sound.setSoundPosition(loaded.handle, position);
			} catch (err) {
				console.warn('sfx setPosition failed', err);
			}
		},
		load: ensureLoaded,
	};
}
