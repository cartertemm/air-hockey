import { describe, test, expect } from 'vitest';
import { getIdentity, setIdentityFromWelcome, setDisplayName, clearIdentity } from '../src/identity.js';

describe('identity', () => {
	test('getIdentity returns nulls when nothing is stored', () => {
		expect(getIdentity()).toEqual({ clientId: null, sessionToken: null, name: null });
	});

	test('setIdentityFromWelcome persists all three fields atomically', () => {
		setIdentityFromWelcome({
			type: 'welcome',
			clientId: 'c1',
			sessionToken: 't1',
			name: 'Swift Otter',
			resumed: false,
		});
		expect(getIdentity()).toEqual({
			clientId: 'c1', sessionToken: 't1', name: 'Swift Otter',
		});
	});

	test('setDisplayName updates only the name', () => {
		setIdentityFromWelcome({ clientId: 'c1', sessionToken: 't1', name: 'A' });
		setDisplayName('B');
		expect(getIdentity()).toEqual({ clientId: 'c1', sessionToken: 't1', name: 'B' });
	});

	test('setDisplayName works before any welcome has been seen', () => {
		setDisplayName('A');
		expect(getIdentity()).toEqual({ clientId: null, sessionToken: null, name: 'A' });
	});

	test('clearIdentity removes the stored record', () => {
		setIdentityFromWelcome({ clientId: 'c1', sessionToken: 't1', name: 'A' });
		clearIdentity();
		expect(getIdentity()).toEqual({ clientId: null, sessionToken: null, name: null });
	});
});
