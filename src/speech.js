import * as settings from './settings.js';
import { isIOSStandalone } from './platform.js';

export const SPEECH_MODE_ARIA = 'aria';
export const SPEECH_MODE_TTS  = 'tts';
export const SPEECH_MODE_BOTH = 'both';

const VALID_MODES = new Set([SPEECH_MODE_ARIA, SPEECH_MODE_TTS, SPEECH_MODE_BOTH]);
const CLEAR_DELAY_MS = 100;

let politeRegion = null;
let assertiveRegion = null;

function createRegion(id, ariaLive, role) {
	const el = document.createElement('div');
	el.id = id;
	el.setAttribute('role', role);
	el.setAttribute('aria-live', ariaLive);
	el.setAttribute('aria-atomic', 'true');
	el.className = 'sr-only';
	document.body.appendChild(el);
	return el;
}

export function initSpeech() {
	if (politeRegion && document.body.contains(politeRegion)) return;
	politeRegion = createRegion('sr-polite', 'polite', 'status');
	assertiveRegion = createRegion('sr-assertive', 'assertive', 'alert');
}

export function speak(text, interrupt = false) {
	const mode = getSpeechMode();
	const useAria = mode === SPEECH_MODE_ARIA || mode === SPEECH_MODE_BOTH;
	const useTTS  = mode === SPEECH_MODE_TTS  || mode === SPEECH_MODE_BOTH;

	if (useAria) {
		const region = interrupt ? assertiveRegion : politeRegion;
		region.textContent = text;
		setTimeout(() => { region.textContent = ''; }, CLEAR_DELAY_MS);
	}

	if (useTTS) {
		if (interrupt) speechSynthesis.cancel();
		speechSynthesis.speak(new SpeechSynthesisUtterance(text));
	}
}

function defaultMode() {
	return isIOSStandalone() ? SPEECH_MODE_TTS : SPEECH_MODE_ARIA;
}

export function setSpeechMode(mode) {
	if (!VALID_MODES.has(mode)) {
		throw new Error(`Invalid speech mode: ${mode}`);
	}
	settings.set('speechMode', mode);
}

export function getSpeechMode() {
	return settings.get('speechMode', defaultMode());
}
