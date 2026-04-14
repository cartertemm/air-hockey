import * as settings from './settings.js';
import { isIOSStandalone } from './platform.js';

export const SPEECH_MODE_ARIA = 'aria';
export const SPEECH_MODE_TTS  = 'tts';
export const SPEECH_MODE_BOTH = 'both';

const VALID_MODES = new Set([SPEECH_MODE_ARIA, SPEECH_MODE_TTS, SPEECH_MODE_BOTH]);
const CLEAR_DELAY_MS = 100;

const DEFAULT_PITCH = 1;
const DEFAULT_RATE  = 1;
const MIN_PITCH = 0;
const MAX_PITCH = 2;
const MIN_RATE  = 0.1;
const MAX_RATE  = 10;

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
		const utterance = new SpeechSynthesisUtterance(text);
		const voice = getVoice();
		if (voice) utterance.voice = voice;
		utterance.pitch = getPitch();
		utterance.rate  = getRate();
		speechSynthesis.speak(utterance);
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

export function getVoices() {
	return speechSynthesis.getVoices();
}

export function getVoice() {
	const voiceURI = settings.get('speechVoice', null);
	if (!voiceURI) return null;
	return getVoices().find(v => v.voiceURI === voiceURI) || null;
}

export function setVoice(voice) {
	const voiceURI = typeof voice === 'string' ? voice : voice?.voiceURI;
	if (!voiceURI) {
		throw new Error('setVoice requires a SpeechSynthesisVoice or voiceURI string');
	}
	settings.set('speechVoice', voiceURI);
}

export function getPitch() {
	return settings.get('speechPitch', DEFAULT_PITCH);
}

export function setPitch(value) {
	if (typeof value !== 'number' || Number.isNaN(value) || value < MIN_PITCH || value > MAX_PITCH) {
		throw new Error(`Pitch must be a number between ${MIN_PITCH} and ${MAX_PITCH}`);
	}
	settings.set('speechPitch', value);
}

export function getRate() {
	return settings.get('speechRate', DEFAULT_RATE);
}

export function setRate(value) {
	if (typeof value !== 'number' || Number.isNaN(value) || value < MIN_RATE || value > MAX_RATE) {
		throw new Error(`Rate must be a number between ${MIN_RATE} and ${MAX_RATE}`);
	}
	settings.set('speechRate', value);
}
