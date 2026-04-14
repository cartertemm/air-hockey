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
					go(screenOfflineMenu());
					c?.close();
				},
			},
		};
	}

	function screenConnecting() {
		welcomeSeen = false;
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
				if (welcomeSeen) return;
				client = null;
				myClient.close();
				go(screenConnectFailed());
			},
			onError: () => {},
		});
		client = myClient;
		return {
			screen: 'connecting',
			props: {
				onCancel: () => {
					const c = client;
					client = null;
					go(screenOfflineMenu());
					c?.close();
				},
			},
		};
	}

	function screenConnectFailed() {
		return {
			screen: 'connectFailed',
			props: {
				onRetry: () => {
					const c = client;
					client = null;
					go(screenConnecting());
					c?.close();
				},
				onCancel: () => {
					const c = client;
					client = null;
					go(screenOfflineMenu());
					c?.close();
				},
			},
		};
	}

	function screenTestSpeakers(wasOnline) {
		return {
			screen: 'testSpeakers',
			props: {
				onPlay: () => playSpeakerTest(),
				onBack: () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu()),
			},
		};
	}

	function screenStubSettings(wasOnline) {
		return {
			screen: 'stubSettings',
			props: { onBack: () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu()) },
		};
	}

	// ---- Incoming message router -----------------------------------------

	function onServerMessage(msg) {
		switch (msg.type) {
			case MSG.WELCOME:
				setIdentityFromWelcome(msg);
				if (!welcomeSeen) {
					welcomeSeen = true;
					go(screenOnlineMenu());
				}
				break;
			// Room/lobby/error handling lands in the next plan increment.
			default:
				break;
		}
	}

	// ---- Boot ------------------------------------------------------------

	const { name } = getIdentity();
	if (!name) go(screenNameEntry());
	else go(screenOfflineMenu());
}
