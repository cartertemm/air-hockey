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
	if (options.loop) handle.loop('infinite');
	if (typeof options.volume === 'number') handle.volume = options.volume;
	/* note: cacophony 0.18.3 Sound exposes `position` directly as [x, y, z]; threeDOptions is the lower-level PannerOptions object */
	if (options.position) handle.position = options.position;
	handle.play();
}

export function stopSound(handle) {
	if (!handle) return;
	handle.stop?.();
}

export function getCacophony() {
	return cacophony;
}
