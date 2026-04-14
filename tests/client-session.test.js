import { describe, test, expect, beforeEach } from 'vitest';
import { startSession } from '../src/session.js';
import { setIdentityFromWelcome, clearIdentity } from '../src/identity.js';
import { MSG } from 'network/protocol.js';

function makeFakeClient() {
	const handlers = {};
	const sent = [];
	const client = {
		sent,
		closeCalled: false,
		send(msg) { sent.push(msg); },
		close() { this.closeCalled = true; handlers.onClose?.({}); },
	};
	function factory(h) {
		Object.assign(handlers, h);
		// Signal open immediately unless the test overrides behavior.
		setTimeout(() => handlers.onOpen?.(client), 0);
		return client;
	}
	factory.client = client;
	factory.fireMessage = (msg) => handlers.onMessage?.(msg);
	factory.fireClose = (event = {}) => handlers.onClose?.(event);
	factory.handlers = handlers;
	return factory;
}

// Fake client that mirrors the real WebSocket's async close semantics:
// calling .close() schedules the onClose event on the microtask queue
// rather than firing it synchronously. Used to regression-test the
// stale-close-handler race that real browsers exposed.
function makeAsyncFakeClient() {
	const handlers = {};
	const client = {
		sent: [],
		closeCalled: false,
		send(msg) { this.sent.push(msg); },
		close() {
			this.closeCalled = true;
			queueMicrotask(() => handlers.onClose?.({}));
		},
	};
	function factory(h) {
		Object.assign(handlers, h);
		queueMicrotask(() => handlers.onOpen?.(client));
		return client;
	}
	factory.client = client;
	factory.fireMessage = (msg) => handlers.onMessage?.(msg);
	return factory;
}

function setupRoot() {
	const root = document.createElement('main');
	document.body.appendChild(root);
	return root;
}

beforeEach(() => {
	document.body.innerHTML = '';
	clearIdentity();
});

describe('session: first load', () => {
	test('no stored name -> nameEntry screen', () => {
		const root = setupRoot();
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		expect(root.querySelector('h1').textContent).toBe('Your name');
	});

	test('stored name -> offline main menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'Swift Otter' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		expect(root.querySelector('h1').textContent).toBe('Welcome, Swift Otter');
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels[0]).toBe('Connect to server');
	});

	test('no net-client is created until the user clicks Connect', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		let built = 0;
		const factory = (h) => { built++; return makeFakeClient()(h); };
		startSession({ root, createClient: factory, isIOS: () => false });
		expect(built).toBe(0);
	});
});

describe('session: name entry', () => {
	test('submitting a name advances to offline main menu', () => {
		const root = setupRoot();
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		const input = root.querySelector('input');
		input.value = 'Swift Otter';
		root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
		expect(root.querySelector('h1').textContent).toBe('Welcome, Swift Otter');
	});

	test('blank submit generates a name', () => {
		const root = setupRoot();
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
		const heading = root.querySelector('h1').textContent;
		expect(heading).toMatch(/^Welcome, [A-Z][a-z]+ [A-Z][a-z]+$/);
	});
});

describe('session: connect flow', () => {
	test('Connect button creates a client and transitions to connecting', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect to server
		expect(root.querySelector('h1').textContent).toBe('Connecting');
	});

	test('welcome transitions to online main menu and persists identity', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		await Promise.resolve();
		// onOpen has fired, which sends hello. Now simulate welcome.
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels).toEqual([
			'Create game', 'Join game', 'Test speakers', 'Configure settings', 'Disconnect',
		]);
	});

	test('first socket close before welcome -> connectFailed', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireClose({});
		expect(root.querySelector('h1').textContent).toBe('Connection failed');
	});

	test('second welcome updates identity but does not re-render the online menu', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		const headingBefore = root.querySelector('h1');
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't2', name: 'A', resumed: true,
		});
		const headingAfter = root.querySelector('h1');
		expect(headingAfter).toBe(headingBefore);
	});

	test('Cancel during connecting returns to offline main menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		// Cancel is autofocused; click the first button.
		root.querySelector('button').click();
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.closeCalled).toBe(true);
	});
});

describe('session: async close timing (regression)', () => {
	test('Disconnect does not flash connectFailed when close fires asynchronously', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeAsyncFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		await Promise.resolve(); // let onOpen drain
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		const disconnect = [...root.querySelectorAll('button')].find(b => b.textContent === 'Disconnect');
		disconnect.click();
		// Drain any deferred onClose microtasks
		await Promise.resolve();
		await Promise.resolve();
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels[0]).toBe('Connect to server');
		expect(factory.client.closeCalled).toBe(true);
	});

	test('Cancel during connecting does not flash connectFailed when close fires asynchronously', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeAsyncFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		// Cancel is autofocused first button on the connecting screen
		root.querySelector('button').click();
		await Promise.resolve();
		await Promise.resolve();
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.closeCalled).toBe(true);
	});
});

describe('session: offline stub screens', () => {
	test('Test speakers screen mentions left/right and returns to offline menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		const testSpeakers = [...root.querySelectorAll('button')].find(b => b.textContent === 'Test speakers');
		testSpeakers.click();
		expect(root.querySelector('h1').textContent).toBe('Test speakers');
		const description = root.querySelector('p').textContent;
		expect(description).toMatch(/left/);
		expect(description).toMatch(/right/);
		expect(description).toMatch(/puck/);
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels).toEqual(['Play test sound', 'Back']);
		const back = [...root.querySelectorAll('button')].find(b => b.textContent === 'Back');
		back.click();
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});
});

function dispatchEscape(root) {
	root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('session: Escape goes back', () => {
	test('Escape on Test speakers returns to offline menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Test speakers').click();
		expect(root.querySelector('h1').textContent).toBe('Test speakers');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('Escape on Configure settings returns to offline menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Configure settings').click();
		expect(root.querySelector('h1').textContent).toBe('Configure settings');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('Escape during connecting cancels and returns to offline menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		expect(root.querySelector('h1').textContent).toBe('Connecting');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.closeCalled).toBe(true);
	});

	test('Escape on connectFailed returns to offline menu', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		await Promise.resolve();
		factory.fireClose({});
		expect(root.querySelector('h1').textContent).toBe('Connection failed');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('Escape on the offline main menu does nothing', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('Escape is ignored on iOS', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Test speakers').click();
		expect(root.querySelector('h1').textContent).toBe('Test speakers');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Test speakers');
	});
});

describe('session: disconnect', () => {
	test('Disconnect tears down client and returns to offline main menu', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({ root, createClient: factory, isIOS: () => false });
		root.querySelector('button').click(); // Connect
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		const disconnect = [...root.querySelectorAll('button')].find(b => b.textContent === 'Disconnect');
		disconnect.click();
		expect(factory.client.closeCalled).toBe(true);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels[0]).toBe('Connect to server');
	});
});
