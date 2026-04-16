import { Cacophony } from 'cacophony';

let cacophony = null;

export async function initSound() {
	if (cacophony) return cacophony;
	cacophony = new Cacophony();
	return cacophony;
}

export async function loadSound(url) {
	if (!cacophony) await initSound();
	/* note: cacophony 0.18.3 createSound() returns Promise<Sound>, so we await here */
	return await cacophony.createSound(url, undefined, 'stereo');
}

export function playSound(handle, options = {}) {
	if (!handle) return;
	const inst = handle.preplay?.()[0];
	if (!inst) return;
	if (options.loop) {
		if ('sourceLoop' in inst) inst.sourceLoop = true;
		else inst.loop?.('infinite');
	}
	if (typeof options.volume === 'number') inst.volume = options.volume;
	if (typeof options.pan === 'number') inst.stereoPan = options.pan;
	if (options.position) inst.position = options.position;
	inst.play?.();
	return inst;
}

export function playLoop(handle, { volume = 1, pan = 0 } = {}) {
	if (!handle) return null;
	if (typeof handle.volume === 'number') handle.volume = volume;
	if (typeof handle.stereoPan === 'number' || handle.stereoPan === null) handle.stereoPan = pan;
	let inst = null;
	try {
		handle.loop?.('infinite');
		inst = handle.preplay?.()[0] ?? null;
	} catch {
		inst = handle.preplay?.()[0] ?? null;
		if (inst) {
			if (typeof inst.loop === 'function') inst.loop('infinite');
			else if ('sourceLoop' in inst) inst.sourceLoop = true;
		}
	}
	if (!inst) return null;
	if (typeof inst.volume === 'number') inst.volume = volume;
	if (typeof inst.stereoPan === 'number' || inst.stereoPan === null) inst.stereoPan = pan;
	inst.play?.();
	return { inst, handle };
}

export function updateLoop(inst, { volume, pan } = {}) {
	const playback = inst?.inst ?? inst;
	if (!playback) return;
	if (typeof volume === 'number') playback.volume = volume;
	if (typeof pan === 'number') playback.stereoPan = pan;
}

export function stopSound(inst) {
	inst?.inst?.stop?.();
	inst?.handle?.stop?.();
	inst?.stop?.();
}

export function getCacophony() {
	return cacophony;
}
