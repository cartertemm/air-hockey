import { get, set, remove } from './settings.js';

const KEY = 'identity';
const EMPTY = { clientId: null, sessionToken: null, name: null };

export function getIdentity() {
	return { ...EMPTY, ...(get(KEY, {}) ?? {}) };
}

export function setIdentityFromWelcome(welcome) {
	set(KEY, {
		clientId: welcome.clientId,
		sessionToken: welcome.sessionToken,
		name: welcome.name,
	});
}

export function setDisplayName(name) {
	const current = getIdentity();
	set(KEY, { ...current, name });
}

export function clearIdentity() {
	remove(KEY);
}
