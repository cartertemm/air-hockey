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
	return await cacophony.createSound(url);
}

export function playSound(handle, options = {}) {
	if (!handle) return;
	const inst = handle.preplay?.()[0] ?? handle.play?.()[0];
	if (!inst) return;
	if (options.loop) inst.loop?.('infinite');
	if (typeof options.volume === 'number') inst.volume = options.volume;
	if (typeof options.pan === 'number') inst.stereoPan = options.pan;
	if (options.position) inst.position = options.position;
	inst.play?.();
	return inst;
}

export function playLoop(handle, { volume = 1, pan = 0 } = {}) {
	if (!handle) return null;
	const inst = handle.preplay?.()[0];
	if (!inst) return null;
	inst.loop?.('infinite');
	inst.volume = volume;
	inst.stereoPan = pan;
	inst.play?.();
	return inst;
}

export function updateLoop(inst, { volume, pan } = {}) {
	if (!inst) return;
	if (typeof volume === 'number') inst.volume = volume;
	if (typeof pan === 'number') inst.stereoPan = pan;
}

export function stopSound(inst) {
	inst?.stop?.();
}

export function getCacophony() {
	return cacophony;
}
