import { createStorage } from 'audiogame-utils/storage';

// The app's single preferences namespace. Existing keys stay under the
// `airhockey:` prefix they have always used.
export const storage = createStorage('airhockey');

export const get = storage.get;
export const set = storage.set;
export const remove = storage.remove;
