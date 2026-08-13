import { createInputHandler } from 'audiogame-utils/input';
import { getKeyboard } from './keyboard.js';
import { getTouch } from './touch.js';

export { formatBinding } from 'audiogame-utils/input';

// Binds against whichever keyboard and touch instances are live at call time,
// which is why this is a function rather than a module-level handler.
export function makeInputHandler(options = {}) {
	return createInputHandler({
		keyboard: getKeyboard(),
		touch: getTouch(),
		...options,
	});
}
