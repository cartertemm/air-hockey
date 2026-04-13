import { initSpeech, speak } from './speech.js';
import { initKeyboard, on as onKey } from './input/keyboard.js';
import { initTouch, on as onTouch } from './input/touch.js';
import { InputHandler } from './input/inputHandler.js';
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

function tapCountWord(n) {
	const words = { 1: '', 2: 'double ', 3: 'triple ' };
	return words[n] ?? `${n}-`;
}

onTouch('tap', event => {
	const finger = event.fingerCount > 1 ? `${numberWord(event.fingerCount)} finger ` : '';
	const count = tapCountWord(event.tapCount);
	speak(`${finger}${count}tap`);
	ensureSound();
});

// Demonstrate the action-based input layer alongside the raw echo above.
const demo = new InputHandler();
demo.bind('action.confirm', {
	press: [' ', 'enter'],
	tap: [{ fingerCount: 1, tapCount: 2 }],
});
demo.bind('action.menu', {
	press: ['escape'],
	tap: [{ fingerCount: 2, tapCount: 1 }],
});
demo.on('action.confirm', () => speak('Action: confirm'));
demo.on('action.menu', () => speak('Action: menu'));
