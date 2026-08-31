import { createSpeech, MODE_TTS } from 'audiogame-utils/speech';
import { storage } from './settings.js';

const speech = createSpeech({ storage, idPrefix: 'sr' });

export const SPEECH_MODE_TTS = MODE_TTS;

export const initSpeech = speech.init;
export const speak      = speech.speak;
export const primeTts   = speech.primeTts;

export const getSpeechMode = speech.getMode;
export const setSpeechMode = speech.setMode;
export const getVoices = speech.getVoices;
export const getVoice  = speech.getVoice;
export const setVoice  = speech.setVoice;
export const getRate   = speech.getRate;
export const setRate   = speech.setRate;
export const getPitch  = speech.getPitch;
export const setPitch  = speech.setPitch;
