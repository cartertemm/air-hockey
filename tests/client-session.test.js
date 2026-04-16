import { describe, test, expect, beforeEach } from 'vitest';
import { startSession } from '../src/session.js';
import { setIdentityFromWelcome, getIdentity, clearIdentity } from '../src/identity.js';
import { getSpeechMode, setSpeechMode, getRate, getPitch, getVoice, SPEECH_MODE_TTS } from '../src/speech.js';
import { MSG, ERR } from 'network/protocol.js';
import * as settings from '../src/settings.js';

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

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function flushAsyncWork() {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await new Promise(resolve => setTimeout(resolve, 0));
	for (let i = 0; i < 4; i++) await Promise.resolve();
}

beforeEach(() => {
	document.body.innerHTML = '';
	clearIdentity();
});

describe('session: iOS install prompt', () => {
	test('shown on first iOS-non-standalone boot', () => {
		const root = setupRoot();
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => true,
			isIOSStandalone: () => false,
		});
		expect(root.querySelector('h1').textContent).toBe('Install for the best experience');
		expect([...root.querySelectorAll('button')].some(b => b.textContent === 'Continue anyway')).toBe(true);
	});

	test('skipped when running as iOS standalone', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => true,
			isIOSStandalone: () => true,
		});
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('skipped on non-iOS platforms', () => {
		const root = setupRoot();
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => false,
			isIOSStandalone: () => false,
		});
		expect(root.querySelector('h1').textContent).toBe('Your name');
	});

	test('skipped when pwaPromptDismissed is already set', () => {
		settings.set('pwaPromptDismissed', true);
		const root = setupRoot();
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => true,
			isIOSStandalone: () => false,
		});
		expect(root.querySelector('h1').textContent).toBe('Your name');
	});

	test('Continue sets the flag and routes to nameEntry when no stored name', () => {
		const root = setupRoot();
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => true,
			isIOSStandalone: () => false,
		});
		clickText(root, 'Continue anyway');
		expect(settings.get('pwaPromptDismissed')).toBe(true);
		expect(root.querySelector('h1').textContent).toBe('Your name');
	});

	test('Continue sets the flag and routes to offline menu when name is stored', () => {
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const root = setupRoot();
		startSession({
			root,
			createClient: makeFakeClient(),
			isIOS: () => true,
			isIOSStandalone: () => false,
		});
		clickText(root, 'Continue anyway');
		expect(settings.get('pwaPromptDismissed')).toBe(true);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});
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
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
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
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
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
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
		openSettings(root);
		const slider = root.querySelector('#settings-rate');
		slider.value = '1.4';
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		expect(getRate()).toBeCloseTo(1.4);
	});

	test('pitch slider change persists via setPitch', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
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
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
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
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
		openSettings(root);
		[...root.querySelectorAll('button')].find(b => b.textContent === 'Test voice').click();
		expect(globalThis.speechSynthesis.spoken.length).toBe(1);
		expect(globalThis.speechSynthesis.spoken[0]).toMatch(/air hockey|puck|Brunswick|Cummings|USAA|mallet|tournament|Houston|Sega|air track/i);
	});

	test('voiceschanged event repopulates the voice select while on the settings screen', () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		globalThis.speechSynthesis.voices = [];
		startSession({ root, createClient: makeFakeClient(), isIOS: () => true, isIOSStandalone: () => true });
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

// Shared helper: reach the online main menu with a known clientId so that
// ROOM_STATE snapshots can address the local member.
async function openOnlineMenu({ isIOS = () => false, name = 'A', clientId = 'c1' } = {}) {
	const root = setupRoot();
	setIdentityFromWelcome({ clientId: null, sessionToken: null, name });
	const factory = makeFakeClient();
	startSession({ root, createClient: factory, isIOS });
	root.querySelector('button').click(); // Connect
	await Promise.resolve();
	factory.fireMessage({
		type: MSG.WELCOME,
		clientId, sessionToken: 't1', name, resumed: false,
	});
	return { root, factory };
}

function clickText(root, text) {
	const btn = [...root.querySelectorAll('button')].find(b => b.textContent === text);
	btn.click();
	return btn;
}

function makeRoom({
	id = 'swift-otter-42',
	phase = 'waiting',
	mode = 'single',
	pointLimit = 7,
	members = [{ clientId: 'c1', name: 'A', ready: false, confirmed: false, connected: true }],
	lastEventMessage = null,
} = {}) {
	return { id, phase, mode, pointLimit, members, createdAt: 0, lastEventMessage };
}

describe('session: create game flow', () => {
	test('Create game opens the form, submits roomCreate, and ROOM_STATE advances to waitingRoom', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		expect(root.querySelector('h1').textContent).toBe('Create game');
		// Defaults: mode=single, points=7 per ui.js
		clickText(root, 'Create');
		const sent = factory.client.sent.find(m => m.type === MSG.ROOM_CREATE);
		expect(sent).toEqual({ type: MSG.ROOM_CREATE, mode: 'single', pointLimit: 7 });
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		expect(root.querySelector('h1').textContent).toBe('Room: swift-otter-42');
	});

	test('changing mode/points is reflected in the submitted payload', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		root.querySelector('input[name=mode][value=bestOf3]').checked = true;
		root.querySelector('input[name=points][value=11]').checked = true;
		clickText(root, 'Create');
		const sent = factory.client.sent.find(m => m.type === MSG.ROOM_CREATE);
		expect(sent).toEqual({ type: MSG.ROOM_CREATE, mode: 'bestOf3', pointLimit: 11 });
	});

	test('Cancel returns to the online menu without sending roomCreate', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Cancel');
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CREATE)).toBe(false);
	});

	test('Escape on create-game screen returns to the online menu', async () => {
		const { root } = await openOnlineMenu();
		clickText(root, 'Create game');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('ERROR with ROOM_FULL during create shows the roomError screen', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ERROR, code: ERR.ROOM_FULL, message: 'full' });
		expect(root.querySelector('h1').textContent).toBe('Room unavailable');
		clickText(root, 'Back');
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});
});

describe('session: join game flow', () => {
	test('opening Join game sends lobbySubscribe and renders an empty list', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		expect(root.querySelector('h1').textContent).toBe('Join game');
		expect(factory.client.sent.some(m => m.type === MSG.LOBBY_SUBSCRIBE)).toBe(true);
		expect(root.querySelector('li').textContent).toBe('No rooms yet.');
	});

	test('LOBBY_UPDATE populates the room list live', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		factory.fireMessage({
			type: MSG.LOBBY_UPDATE,
			full: true,
			rooms: [
				{ id: 'r1', hostName: 'Host One', mode: 'single',  pointLimit: 7,  memberCount: 1, phase: 'waiting' },
				{ id: 'r2', hostName: 'Host Two', mode: 'bestOf3', pointLimit: 11, memberCount: 1, phase: 'waiting' },
			],
		});
		const labels = [...root.querySelectorAll('li button')].map(b => b.textContent);
		expect(labels).toEqual([
			'Host One — single — 7 pts (1/2)',
			'Host Two — bestOf3 — 11 pts (1/2)',
		]);
	});

	test('picking a room sends roomJoin and ROOM_STATE advances to waitingRoom', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		factory.fireMessage({
			type: MSG.LOBBY_UPDATE, full: true,
			rooms: [{ id: 'r1', hostName: 'H', mode: 'single', pointLimit: 7, memberCount: 1, phase: 'waiting' }],
		});
		root.querySelector('li button').click();
		const sent = factory.client.sent.find(m => m.type === MSG.ROOM_JOIN);
		expect(sent).toEqual({ type: MSG.ROOM_JOIN, roomId: 'r1' });
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom({ id: 'r1' }) });
		expect(root.querySelector('h1').textContent).toBe('Room: r1');
	});

	test('Back on join screen sends lobbyUnsubscribe and returns to online menu', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		clickText(root, 'Back');
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.sent.some(m => m.type === MSG.LOBBY_UNSUBSCRIBE)).toBe(true);
	});

	test('Escape on join screen sends lobbyUnsubscribe and returns to online menu', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		dispatchEscape(root);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
		expect(factory.client.sent.some(m => m.type === MSG.LOBBY_UNSUBSCRIBE)).toBe(true);
	});

	test('ERROR with ROOM_NOT_FOUND while joining shows the roomError screen', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Join game');
		factory.fireMessage({
			type: MSG.LOBBY_UPDATE, full: true,
			rooms: [{ id: 'r1', hostName: 'H', mode: 'single', pointLimit: 7, memberCount: 1, phase: 'waiting' }],
		});
		root.querySelector('li button').click();
		factory.fireMessage({ type: MSG.ERROR, code: ERR.ROOM_NOT_FOUND, message: 'gone' });
		expect(root.querySelector('h1').textContent).toBe('Room unavailable');
	});
});

describe('session: waiting room', () => {
	test('Ready button sends roomReady and flips to Unready after server echo', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		clickText(root, 'Ready');
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_READY)).toBe(true);
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				members: [{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true }],
			}),
		});
		expect([...root.querySelectorAll('button')].some(b => b.textContent === 'Unready')).toBe(true);
	});

	test('Unready sends roomUnready', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				members: [{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true }],
			}),
		});
		clickText(root, 'Unready');
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_UNREADY)).toBe(true);
	});

	test('Leave sends roomLeave and returns to the online menu', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		clickText(root, 'Leave');
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_LEAVE)).toBe(true);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('Escape in the waiting room leaves and returns to the online menu', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		dispatchEscape(root);
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_LEAVE)).toBe(true);
		expect(root.querySelector('h1').textContent).toBe('Welcome, A');
	});

	test('ROOM_STATE with lastEventMessage renders a polite aria-live announcement', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				members: [{ clientId: 'c1', name: 'A', ready: false, confirmed: false, connected: true }],
				lastEventMessage: 'Bob has disconnected.',
			}),
		});
		const live = [...root.querySelectorAll('p')].find(p => p.getAttribute('aria-live') === 'polite');
		expect(live).toBeTruthy();
		expect(live.textContent).toBe('Bob has disconnected.');
		expect(live.getAttribute('role')).toBe('status');
	});

	test('phase=ready ROOM_STATE advances to handoff (desktop)', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Almost ready');
		expect(root.querySelector('p').textContent).toMatch(/Continue/);
		expect([...root.querySelectorAll('button')].some(b => b.textContent === 'Continue')).toBe(true);
	});

	test('joining player sees a waiting handoff without Continue', async () => {
		const { root, factory } = await openOnlineMenu({ clientId: 'c2' });
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom({ members: [
			{ clientId: 'c1', name: 'A', ready: false, confirmed: false, connected: true },
			{ clientId: 'c2', name: 'B', ready: false, confirmed: false, connected: true },
		] }) });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Waiting for player 1');
		expect(root.querySelector('p').textContent).toMatch(/Waiting for player 1/);
		expect([...root.querySelectorAll('button')].some(b => b.textContent === 'Continue')).toBe(false);
	});
});

describe('session: handoff and countdown', () => {
	test('clicking Continue on desktop handoff sends roomConfirm', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => false,
			loadGameplay: async () => ({
				Game: class {},
				createGameAudio: () => ({ attach() {}, dispose() {} }),
				preloadGameAudio: async () => {},
			}),
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		clickText(root, 'Continue');
		await flushAsyncWork();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(true);
	});

	test('clicking Continue waits for gameplay preload before sending roomConfirm', async () => {
		const preload = deferred();
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => false,
			loadGameplay: () => preload.promise,
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		clickText(root, 'Continue');
		await Promise.resolve();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(false);
		preload.resolve({
			Game: class {},
			createGameAudio: () => ({ attach() {}, dispose() {} }),
			preloadGameAudio: async () => {},
		});
		await flushAsyncWork();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(true);
	});

	test('pressing Enter on the waiting-player handoff does not send roomConfirm', async () => {
		const { root, factory } = await openOnlineMenu({ clientId: 'c2' });
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom({ members: [
			{ clientId: 'c1', name: 'A', ready: false, confirmed: false, connected: true },
			{ clientId: 'c2', name: 'B', ready: false, confirmed: false, connected: true },
		] }) });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(false);
		expect(root.querySelector('h1').textContent).toBe('Waiting for player 1');
	});

	test('waiting player auto-confirms after gameplay preload finishes', async () => {
		const preload = deferred();
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'B' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => false,
			loadGameplay: () => preload.promise,
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c2', sessionToken: 't1', name: 'B', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				members: [
					{ clientId: 'c1', name: 'A', ready: false, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: false, confirmed: false, connected: true },
				],
			}),
		});
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		await Promise.resolve();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(false);
		preload.resolve({
			Game: class {},
			createGameAudio: () => ({ attach() {}, dispose() {} }),
			preloadGameAudio: async () => {},
		});
		await flushAsyncWork();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(true);
	});

	test('pressing Enter on desktop handoff sends roomConfirm', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => false,
			loadGameplay: async () => ({
				Game: class {},
				createGameAudio: () => ({ attach() {}, dispose() {} }),
				preloadGameAudio: async () => {},
			}),
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flushAsyncWork();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(true);
	});

	test('ROOM_COUNTDOWN advances to the gameplay screen', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		factory.fireMessage({ type: MSG.ROOM_COUNTDOWN, roomId: 'swift-otter-42' });
		const region = root.querySelector('main[role="application"][aria-label="gameplay"]');
		expect(region).toBeTruthy();
	});

	test('gameplay buffers start messages until audio is attached', async () => {
		const audioReady = deferred();
		const handled = [];
		class FakeGame {
			constructor() {
				this.client = {
					handleMessage: (msg) => handled.push(msg.type),
				};
			}
		}
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => false,
			loadGameplay: async () => {
				await audioReady.promise;
				return {
					Game: FakeGame,
					preloadGameAudio: async () => {},
					createGameAudio: () => ({ attach() {}, dispose() {} }),
				};
			},
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		clickText(root, 'Continue');
		await Promise.resolve();
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom({
			phase: 'ready',
			members: [
				{ clientId: 'c1', name: 'A', ready: true, confirmed: true, connected: true },
				{ clientId: 'c2', name: 'B', ready: true, confirmed: true, connected: true },
			],
		}) });
		factory.fireMessage({ type: MSG.ROOM_COUNTDOWN, roomId: 'swift-otter-42' });
		factory.fireMessage({ type: MSG.GAME_START, localPlayer: 'p1', pointLimit: 7 });
		factory.fireMessage({ type: MSG.GAME_SNAPSHOT, tick: 0, state: 'COUNTDOWN', puck: {}, mallets: {}, scores: {}, servingPlayer: null, events: [] });
		expect(handled).toEqual([]);
		audioReady.resolve();
		await flushAsyncWork();
		expect(handled).toEqual([MSG.GAME_START, MSG.GAME_SNAPSHOT]);
	});

	test('opponent unready during handoff reverts to the waiting room', async () => {
		const { root, factory } = await openOnlineMenu();
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Almost ready');
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'waiting',
				members: [
					{ clientId: 'c1', name: 'A', ready: true,  confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: false, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Room: swift-otter-42');
	});

	test('iOS handoff shows the VoiceOver notice and Continue sends roomConfirm', async () => {
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => true,
			isIOSStandalone: () => true,
			loadGameplay: async () => ({
				Game: class {},
				createGameAudio: () => ({ attach() {}, dispose() {} }),
				preloadGameAudio: async () => {},
			}),
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Almost ready');
		expect(root.querySelector('p').textContent).toMatch(/VoiceOver/);
		clickText(root, 'Continue');
		await flushAsyncWork();
		expect(factory.client.sent.some(m => m.type === MSG.ROOM_CONFIRM)).toBe(true);
	});

	test('iOS handoff VoiceOver notice shows even when running in the browser (prompt dismissed)', async () => {
		settings.set('pwaPromptDismissed', true);
		const root = setupRoot();
		setIdentityFromWelcome({ clientId: null, sessionToken: null, name: 'A' });
		const factory = makeFakeClient();
		startSession({
			root,
			createClient: factory,
			isIOS: () => true,
			isIOSStandalone: () => false,
			loadGameplay: async () => ({
				Game: class {},
				createGameAudio: () => ({ attach() {}, dispose() {} }),
				preloadGameAudio: async () => {},
			}),
		});
		root.querySelector('button').click();
		await Promise.resolve();
		factory.fireMessage({
			type: MSG.WELCOME,
			clientId: 'c1', sessionToken: 't1', name: 'A', resumed: false,
		});
		clickText(root, 'Create game');
		clickText(root, 'Create');
		factory.fireMessage({ type: MSG.ROOM_STATE, room: makeRoom() });
		factory.fireMessage({
			type: MSG.ROOM_STATE,
			room: makeRoom({
				phase: 'ready',
				members: [
					{ clientId: 'c1', name: 'A', ready: true, confirmed: false, connected: true },
					{ clientId: 'c2', name: 'B', ready: true, confirmed: false, connected: true },
				],
			}),
		});
		expect(root.querySelector('h1').textContent).toBe('Almost ready');
		expect(root.querySelector('p').textContent).toMatch(/VoiceOver/);
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
