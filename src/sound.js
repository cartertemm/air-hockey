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

export function stopSound(inst) {
	inst?.inst?.stop?.();
	inst?.handle?.stop?.();
	inst?.stop?.();
}

export function setSoundPosition(handle, position) {
	if (!handle) return;
	handle.position = position;
}

export function getCacophony() {
	return cacophony;
}
