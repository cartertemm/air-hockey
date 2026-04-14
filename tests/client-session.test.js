import { describe, test, expect, beforeEach } from 'vitest';
import { startSession } from '../src/session.js';
import { setIdentityFromWelcome, getIdentity, clearIdentity } from '../src/identity.js';
import { getSpeechMode, setSpeechMode, getRate, getPitch, getVoice, SPEECH_MODE_TTS } from '../src/speech.js';
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

describe('session: settings screen', () => {
	function openSettings(root) {
		[...root.querySelectorAll('button')]
			.find(b => b.textContent === 'Configure settings')
			.click();
	}

	test('opening settings from offline menu shows the settings screen with name field', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		expect(root.querySelector('h1').textContent).toBe('Configure settings');
		expect(root.querySelector('#settings-name')).toBeTruthy();
		expect(root.querySelector('#settings-name').value).toBe('A');
	});

	test('Back button returns to the offline menu', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Back').click();
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('typing a name and blurring saves it via setDisplayName', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'Old' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		const input = root.querySelector('#settings-name');
		input.value = 'New Name';
		input.dispatchEvent(new Event('blur'));
		expect(getIdentity().name).toBe('New Name');
	});

	test('blank name on blur is a no-op', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'Old' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		const input = root.querySelector('#settings-name');
		input.value = '   ';
		input.dispatchEvent(new Event('blur'));
		expect(getIdentity().name).toBe('Old');
	});

	test('Generate name button persists a random name and refocuses the input', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'Original' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		const input = root.querySelector('#settings-name');
		const generate = [...root.querySelectorAll('button')].find(b => b.textContent === 'Generate name');
		generate.click();
		const after = getIdentity().name;
		expect(after).not.toBe('Original');
		expect(after).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
		expect(input.value).toBe(after);
		expect(document.activeElement).toBe(input);
	});

	test('switching to TTS on desktop reveals voice/rate/pitch controls and persists the mode', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => false });
		openSettings(root);
		expect(root.querySelector('#settings-voice')).toBeNull();
		const ttsRadio = root.querySelector('#settings-mode-tts');
		ttsRadio.checked = true;
		ttsRadio.dispatchEvent(new Event('change', { bubbles: true }));
		expect(getSpeechMode()).toBe('tts');
		expect(root.querySelector('#settings-voice')).toBeTruthy();
		expect(root.querySelector('#settings-rate')).toBeTruthy();
		expect(root.querySelector('#settings-pitch')).toBeTruthy();
	});

	test('iOS opens settings without output mode radios', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		expect(root.querySelector('#settings-mode-aria')).toBeNull();
		expect(root.querySelector('#settings-mode-tts')).toBeNull();
		expect(root.querySelector('#settings-voice')).toBeTruthy();
		expect(root.querySelector('#settings-rate')).toBeTruthy();
		expect(root.querySelector('#settings-pitch')).toBeTruthy();
	});

	test('rate slider change persists via setRate', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		const slider = root.querySelector('#settings-rate');
		slider.value = '1.4';
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		expect(getRate()).toBeCloseTo(1.4);
	});

	test('pitch slider change persists via setPitch', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		const slider = root.querySelector('#settings-pitch');
		slider.value = '0.6';
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		expect(getPitch()).toBeCloseTo(0.6);
	});

	test('voice select change persists via setVoice', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		globalThis.speechSynthesis.voices = [
			{ name: 'Alpha', voiceURI: 'a' },
			{ name: 'Beta',  voiceURI: 'b' },
		];
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		const select = root.querySelector('#settings-voice');
		select.value = 'b';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(getVoice()?.voiceURI).toBe('b');
	});

	test('Test voice button speaks one of the air hockey facts', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		// The Test voice button only appears once the user is in TTS mode, so
		// match that invariant here (iOS session default would normally force
		// TTS, but speech.js reads navigator.standalone directly rather than
		// the injected isIOS fake).
		setSpeechMode(SPEECH_MODE_TTS);
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Test voice').click();
		expect(globalThis.speechSynthesis.spoken.length).toBe(1);
		expect(globalThis.speechSynthesis.spoken[0]).toMatch(/air hockey|puck|Brunswick|Cummings|USAA|mallet|tournament|Houston|Sega|air track/i);
	});

	test('voiceschanged event repopulates the voice select while on the settings screen', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		globalThis.speechSynthesis.voices = [];
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true });
		openSettings(root);
		const before = [...root.querySelectorAll('#settings-voice option')].map(o => o.textContent);
		expect(before).toContain('(no voices available)');
		globalThis.speechSynthesis.voices = [
			{ name: 'Alpha', voiceURI: 'a' },
			{ name: 'Beta',  voiceURI: 'b' },
		];
		globalThis.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
		const after = [...root.querySelectorAll('#settings-voice option')].map(o => o.textContent);
		expect(after).toEqual(['Alpha', 'Beta']);
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
