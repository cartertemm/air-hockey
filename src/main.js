import { initSpeech, speak } from './speech.js';
import { initKeyboard, on as onKey } from './input/keyboard.js';
import { initTouch, on as onTouch } from './input/touch.js';
import { initSound } from './sound.js';

let soundReady = false;

async function ensureSound() {
	if (soundReady) return;
	try {
		await initSound();
		soundReady = true;
	} catch (err) {
		console.warn('sound init failed', err);
	}
}

initSpeech();
initKeyboard();
initTouch();

speak('Air hockey framework ready. Press space, swipe, or tap to test.');

onKey('keypress', event => {
	const name = event.key === ' ' ? 'space' : event.key;
	speak(`You pressed ${name}`);
	ensureSound();
});

function numberWord(n) {
	const words = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
	return words[n] ?? String(n);
}

onTouch('swipe', event => {
	const prefix = event.fingerCount > 1 ? `${numberWord(event.fingerCount)} finger ` : '';
	speak(`${prefix}swipe ${event.direction}`, true);
	ensureSound();
});

onTouch('tap', () => {
	speak('Tap');
	ensureSound();
});
