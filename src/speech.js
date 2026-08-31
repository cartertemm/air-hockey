import { createSpeech } from 'audiogame-utils/speech';
import { storage } from './settings.js';

export const speech = createSpeech({ storage, idPrefix: 'sr' });
