import { initKeyboard } from './input/keyboard.js';
import { startSession } from './session.js';

const root = document.querySelector('main');
initKeyboard();
startSession({ root });
