import { createIdentity } from 'audiogame-utils/net';
import { storage } from './settings.js';

const identity = createIdentity(storage);

export const getIdentity = identity.get;

export function setIdentityFromWelcome(welcome) {
	identity.set({
		clientId: welcome.clientId,
		sessionToken: welcome.sessionToken,
		name: welcome.name,
	});
}

export function setDisplayName(name) {
	identity.set({ name });
}

export const clearIdentity = identity.clear;
