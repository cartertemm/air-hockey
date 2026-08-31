import { createStorage } from 'audiogame-utils/storage';

export const storage = createStorage('airhockey');

export const get = storage.get;
export const set = storage.set;
export const remove = storage.remove;
