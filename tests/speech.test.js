import { describe, test, expect, beforeEach } from 'vitest';
import {
	initSpeech,
	speak,
	setSpeechMode,
	getSpeechMode,
	SPEECH_MODE_ARIA,
	SPEECH_MODE_TTS,
	SPEECH_MODE_BOTH,
} from '../src/speech.js';

describe('speech: init', () => {
	test('initSpeech creates a polite live region', () => {
		initSpeech();
		const polite = document.getElementById('sr-polite');
		expect(polite).not.toBeNull();
		expect(polite.getAttribute('aria-live')).toBe('polite');
		expect(polite.getAttribute('role')).toBe('status');
		expect(polite.getAttribute('aria-atomic')).toBe('true');
		expect(polite.classList.contains('sr-only')).toBe(true);
	});

	test('initSpeech creates an assertive live region', () => {
		initSpeech();
		const assertive = document.getElementById('sr-assertive');
		expect(assertive).not.toBeNull();
		expect(assertive.getAttribute('aria-live')).toBe('assertive');
		expect(assertive.getAttribute('role')).toBe('alert');
		expect(assertive.getAttribute('aria-atomic')).toBe('true');
		expect(assertive.classList.contains('sr-only')).toBe(true);
	});

	test('calling initSpeech twice does not duplicate regions', () => {
		initSpeech();
		initSpeech();
		expect(document.querySelectorAll('#sr-polite').length).toBe(1);
		expect(document.querySelectorAll('#sr-assertive').length).toBe(1);
	});
});

describe('speech: mode', () => {
	beforeEach(() => initSpeech());

	test('default mode is aria when not in iOS standalone', () => {
		expect(getSpeechMode()).toBe(SPEECH_MODE_ARIA);
	});

	test('default mode is tts in iOS standalone', () => {
		Object.defineProperty(window.navigator, 'standalone', {
			value: true,
			configurable: true,
		});
		expect(getSpeechMode()).toBe(SPEECH_MODE_TTS);
		delete window.navigator.standalone;
	});

	test('setSpeechMode persists the mode', () => {
		setSpeechMode(SPEECH_MODE_BOTH);
		expect(getSpeechMode()).toBe(SPEECH_MODE_BOTH);
		expect(localStorage.getItem('airhockey:speechMode')).toBe('"both"');
	});

	test('setSpeechMode rejects invalid modes', () => {
		expect(() => setSpeechMode('shouting')).toThrow();
	});
});

describe('speech: speak (aria)', () => {
	beforeEach(() => {
		initSpeech();
		setSpeechMode(SPEECH_MODE_ARIA);
	});

	test('writes text to the polite region by default', () => {
		speak('hello');
		expect(document.getElementById('sr-polite').textContent).toBe('hello');
	});

	test('writes text to the assertive region when interrupt is true', () => {
		speak('alert', true);
		expect(document.getElementById('sr-assertive').textContent).toBe('alert');
		expect(document.getElementById('sr-polite').textContent).toBe('');
	});

	test('clears region text after 150ms so same string can re-announce', async () => {
		speak('again');
		expect(document.getElementById('sr-polite').textContent).toBe('again');
		await new Promise(r => setTimeout(r, 200));
		expect(document.getElementById('sr-polite').textContent).toBe('');
	});

	test('does not call speechSynthesis in aria-only mode', () => {
		speak('quiet');
		expect(globalThis.speechSynthesis.spoken).toEqual([]);
	});
});

describe('speech: speak (tts)', () => {
	beforeEach(() => {
		initSpeech();
		setSpeechMode(SPEECH_MODE_TTS);
	});

	test('passes text to speechSynthesis.speak', () => {
		speak('hello via tts');
		expect(globalThis.speechSynthesis.spoken).toEqual(['hello via tts']);
	});

	test('does not write to ARIA regions in tts-only mode', () => {
		speak('silent dom');
		expect(document.getElementById('sr-polite').textContent).toBe('');
		expect(document.getElementById('sr-assertive').textContent).toBe('');
	});

	test('interrupt cancels current TTS before speaking', () => {
		speak('one');
		speak('two', true);
		expect(globalThis.speechSynthesis.cancelCalls).toBe(1);
		expect(globalThis.speechSynthesis.spoken).toEqual(['one', 'two']);
	});

	test('non-interrupt does not cancel', () => {
		speak('one');
		speak('two');
		expect(globalThis.speechSynthesis.cancelCalls).toBe(0);
	});
});

describe('speech: speak (both)', () => {
	beforeEach(() => {
		initSpeech();
		setSpeechMode(SPEECH_MODE_BOTH);
	});

	test('writes to ARIA AND speechSynthesis', () => {
		speak('double');
		expect(document.getElementById('sr-polite').textContent).toBe('double');
		expect(globalThis.speechSynthesis.spoken).toEqual(['double']);
	});
});
