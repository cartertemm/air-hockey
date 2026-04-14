import { getIdentity, setIdentityFromWelcome, setDisplayName } from './identity.js';
import { generateName } from './names.js';
import { renderScreen } from './ui.js';
import { createClient as realCreateClient } from './net/client.js';
import { isIOSStandalone } from './platform.js';
import {
	MSG,
	hello,
	roomCreate,
	roomJoin,
	roomLeave,
	roomReady,
	roomUnready,
	roomConfirm,
	lobbySubscribe,
	lobbyUnsubscribe,
} from 'network/protocol.js';

// Lazily loaded so cacophony and the .ogg asset are never pulled into tests
// (no test clicks Play). The dynamic imports also defer cacophony's AudioContext
// construction until after the user gesture that opens the speaker-test screen.
async function playSpeakerTest() {
	try {
		const [sound, urlMod] = await Promise.all([
			import('./sound.js'),
			import('../sounds/speaker_test.ogg?url'),
		]);
		await sound.initSound();
		const handle = await sound.loadSound(urlMod.default);
		sound.playSound(handle);
	} catch (err) {
		console.warn('speaker test failed', err);
	}
}

let notificationSoundsPromise = null;
function loadNotificationSounds() {
	if (notificationSoundsPromise) return notificationSoundsPromise;
	if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
		notificationSoundsPromise = Promise.resolve(null);
		return notificationSoundsPromise;
	}
	notificationSoundsPromise = (async () => {
		const [sound, connectUrl, disconnectUrl] = await Promise.all([
			import('./sound.js'),
			import('../sounds/connect_notification.ogg?url'),
			import('../sounds/disconnect_notification.ogg?url'),
		]);
		await sound.initSound();
		const [connect, disconnect] = await Promise.all([
			sound.loadSound(connectUrl.default),
			sound.loadSound(disconnectUrl.default),
		]);
		return { play: sound.playSound, connect, disconnect };
	})();
	return notificationSoundsPromise;
}

async function playNotification(kind) {
	try {
		const sounds = await loadNotificationSounds();
		if (!sounds) return;
		sounds.play(kind === 'connect' ? sounds.connect : sounds.disconnect);
	} catch (err) {
		console.warn('notification sound failed', err);
	}
}

// startSession accepts dependency overrides for tests. Call sites in app code
// pass no options; tests inject createClient/isIOS fakes.
export function startSession({ root, createClient = realCreateClient, isIOS = isIOSStandalone } = {}) {
	let state = null;
	let currentScreen = null;
	let client = null;
	let welcomeSeen = false;

	function go(next, props = {}) {
		currentScreen?.dispose?.();
		state = next;
		currentScreen = renderScreen(root, next.screen, { ...next.props, ...props });
	}

	// ---- Screen builders -------------------------------------------------

	function screenNameEntry() {
		return {
			screen: 'nameEntry',
			props: {
				onSubmit: value => {
					const name = value ?? generateName();
					setDisplayName(name);
					go(screenOfflineMenu());
				},
			},
		};
	}

	function screenOfflineMenu() {
		const { name } = getIdentity();
		return {
			screen: 'mainMenu',
			props: {
				name,
				connected: false,
				onConnect:       () => go(screenConnecting()),
				onTestSpeakers:  () => go(screenTestSpeakers(false)),
				onSettings:      () => go(screenStubSettings(false)),
			},
		};
	}

	function screenOnlineMenu() {
		const { name } = getIdentity();
		return {
			screen: 'mainMenu',
			props: {
				name,
				connected: true,
				onCreate:        () => { /* TODO: createGame screen — not in this task */ },
				onJoin:          () => { /* TODO: joinGame screen — not in this task */ },
				onTestSpeakers:  () => go(screenTestSpeakers(true)),
				onSettings:      () => go(screenStubSettings(true)),
				onDisconnect:    () => {
					const c = client;
					client = null;
					playNotification('disconnect');
					go(screenOfflineMenu());
					c?.close();
				},
			},
		};
	}

	function screenConnecting() {
		welcomeSeen = false;
		loadNotificationSounds().catch(() => {});
		// Capture myClient so stale close handlers from abandoned connection
		// attempts (disconnect, cancel, retry) can tell themselves apart from
		// the current active client. Without this, a real WebSocket's async
		// close event fires after we've already moved on, stale handlers see
		// welcomeSeen=false, and the UI flashes connectFailed.
		const myClient = createClient({
			onOpen: (c) => {
				const id = getIdentity();
				c.send(hello({
					clientId: id.clientId ?? undefined,
					sessionToken: id.sessionToken ?? undefined,
					name: id.name,
				}));
			},
			onMessage: onServerMessage,
			onClose: () => {
				if (client !== myClient) return;
				if (welcomeSeen) {
					playNotification('disconnect');
					return;
				}
				client = null;
				myClient.close();
				go(screenConnectFailed());
			},
			onError: () => {},
		});
		client = myClient;
		const cancel = () => {
			const c = client;
			client = null;
			go(screenOfflineMenu());
			c?.close();
		};
		return {
			screen: 'connecting',
			props: { onCancel: cancel },
			onEscape: cancel,
		};
	}

	function screenConnectFailed() {
		const cancel = () => {
			const c = client;
			client = null;
			go(screenOfflineMenu());
			c?.close();
		};
		return {
			screen: 'connectFailed',
			props: {
				onRetry: () => {
					const c = client;
					client = null;
					go(screenConnecting());
					c?.close();
				},
				onCancel: cancel,
			},
			onEscape: cancel,
		};
	}

	function screenTestSpeakers(wasOnline) {
		const back = () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu());
		return {
			screen: 'testSpeakers',
			props: {
				onPlay: () => playSpeakerTest(),
				onBack: back,
			},
			onEscape: back,
		};
	}

	function screenStubSettings(wasOnline) {
		const back = () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu());
		return {
			screen: 'stubSettings',
			props: { onBack: back },
			onEscape: back,
		};
	}

	// ---- Incoming message router -----------------------------------------

	function onServerMessage(msg) {
		switch (msg.type) {
			case MSG.WELCOME:
				setIdentityFromWelcome(msg);
				if (!welcomeSeen) {
					welcomeSeen = true;
					playNotification('connect');
					go(screenOnlineMenu());
				}
				break;
			// Room/lobby/error handling lands in the next plan increment.
			default:
				break;
		}
	}

	// ---- Boot ------------------------------------------------------------

	// Desktop Escape = "go back". Each screen builder that supports a back
	// action sets onEscape on its returned record. iOS standalone is excluded
	// because it has no physical Escape key and VoiceOver reserves Escape for
	// rotor gestures. The listener is attached to root so it's GC'd along
	// with the test root between vitest runs.
	root.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		if (isIOS()) return;
		if (!state?.onEscape) return;
		event.preventDefault();
		state.onEscape();
	});
	const { name } = getIdentity();
	if (!name) go(screenNameEntry());
	else go(screenOfflineMenu());
}
