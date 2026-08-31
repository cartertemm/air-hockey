import { createIdentity } from 'audiogame-utils/net';
import { storage } from './settings.js';

export const identity = createIdentity(storage);

export const getIdentity = identity.get;
export const clearIdentity = identity.clear;

export function setDisplayName(name) {
	identity.set({ name });
}
