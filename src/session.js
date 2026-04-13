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
				onTestSpeakers:  () => go(screenStubSpeakers(false)),
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
				onTestSpeakers:  () => go(screenStubSpeakers(true)),
				onSettings:      () => go(screenStubSettings(true)),
				onDisconnect:    () => {
					client?.close();
					client = null;
					welcomeSeen = false;
					go(screenOfflineMenu());
				},
			},
		};
	}

	function screenConnecting() {
		welcomeSeen = false;
		client = createClient({
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
				if (!welcomeSeen) go(screenConnectFailed());
			},
			onError: () => {},
		});
		return {
			screen: 'connecting',
			props: {
				onCancel: () => {
					client?.close();
					client = null;
					go(screenOfflineMenu());
				},
			},
		};
	}

	function screenConnectFailed() {
		return {
			screen: 'connectFailed',
			props: {
				onRetry: () => {
					client?.close();
					client = null;
					go(screenConnecting());
				},
				onCancel: () => {
					client?.close();
					client = null;
					go(screenOfflineMenu());
				},
			},
		};
	}

	function screenStubSpeakers(wasOnline) {
		return {
			screen: 'stubSpeakers',
			props: { onBack: () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu()) },
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
