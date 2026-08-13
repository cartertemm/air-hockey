import { createAudio } from 'audiogame-utils/audio';

// The app's single audio engine. Sound tables can still be declared at module
// scope: nothing is fetched and no AudioContext is created until first play.
export const audio = createAudio();

export const sfx = audio.sfx;
