import { createInputHandler } from 'audiogame-utils/input';
import { getKeyboard } from './keyboard.js';
import { getTouch } from './touch.js';

export { formatBinding } from 'audiogame-utils/input';

export function makeInputHandler(options = {}) {
	return createInputHandler({
		keyboard: getKeyboard(),
		touch: getTouch(),
		...options,
	});
}
