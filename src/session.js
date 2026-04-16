import { getIdentity, setIdentityFromWelcome, setDisplayName } from './identity.js';
import { generateName } from './names.js';
import { renderScreen } from './ui.js';
import { createClient as realCreateClient } from './net/client.js';
import { isIOSStandalone } from './platform.js';
import { initTouch, disposeTouch } from './input/touch.js';
import {
	initSpeech,
	speak,
	getSpeechMode,
	setSpeechMode,
	getVoices,
	getVoice,
	setVoice,
	getRate,
	setRate,
	getPitch,
	setPitch,
} from './speech.js';
import { randomFact } from './airHockeyFacts.js';
import {
	MSG,
	ERR,
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

const ROOM_ERROR_MESSAGES = {
	[ERR.ROOM_FULL]:         'That room just filled up. Pick another or create a new one.',
	[ERR.ROOM_NOT_JOINABLE]: 'That room is no longer accepting players.',
	[ERR.ROOM_NOT_FOUND]:    'That room no longer exists.',
};

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

let gameBundlePromise = null;
async function loadGameBundle() {
	if (gameBundlePromise) return gameBundlePromise;
	gameBundlePromise = (async () => {
		const [gameMod, audioMod, sound] = await Promise.all([
			import('./game.js'),
			import('./audio/gameAudio.js'),
			import('./sound.js'),
		]);
		return {
			Game: gameMod.Game,
			createGameAudio: audioMod.createGameAudio,
			preloadGameAudio: audioMod.preloadGameAudio,
			sound,
		};
	})();
	return gameBundlePromise;
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
export function startSession({ root, createClient = realCreateClient, isIOS = isIOSStandalone, loadGameplay = loadGameBundle } = {}) {
	let state = null;
	let currentScreen = null;
	let client = null;
	let welcomeSeen = false;
	let gameplayPreparation = null;

	function go(next, props = {}) {
		currentScreen?.dispose?.();
		state?.onDispose?.();
		state = next;
		currentScreen = renderScreen(root, next.screen, { ...next.props, ...props });
	}

	function prepareGameplay() {
		if (gameplayPreparation) return gameplayPreparation;
		gameplayPreparation = (async () => {
			initSpeech();
			const bundle = await loadGameplay();
			await bundle.preloadGameAudio({ sound: bundle.sound });
			return bundle;
		})();
		return gameplayPreparation;
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
				onSettings:      () => go(screenSettings(false)),
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
				onCreate:        () => go(screenCreateGame()),
				onJoin:          () => go(screenJoinGame()),
				onTestSpeakers:  () => go(screenTestSpeakers(true)),
				onSettings:      () => go(screenSettings(true)),
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

	function screenCreateGame() {
		const cancel = () => go(screenOnlineMenu());
		return {
			screen: 'createGame',
			props: {
				onSubmit: ({ mode, pointLimit }) => {
					client?.send(roomCreate({ mode, pointLimit }));
				},
				onCancel: cancel,
			},
			onEscape: cancel,
			onMessage: (msg) => {
				if (msg.type === MSG.ROOM_STATE) {
					go(screenWaitingRoom(msg.room));
					return true;
				}
				if (msg.type === MSG.ERROR && ROOM_ERROR_MESSAGES[msg.code]) {
					go(screenRoomError(msg.code));
					return true;
				}
				return false;
			},
		};
	}

	function screenJoinGame() {
		let listUpdater = null;
		const back = () => go(screenOnlineMenu());
		client?.send(lobbySubscribe());
		return {
			screen: 'joinGame',
			props: {
				rooms: [],
				onReady: ({ update }) => { listUpdater = update; },
				onPick: (roomId) => {
					client?.send(roomJoin({ roomId }));
				},
				onBack: back,
			},
			onEscape: back,
			onDispose: () => {
				client?.send(lobbyUnsubscribe());
			},
			onMessage: (msg) => {
				if (msg.type === MSG.LOBBY_UPDATE) {
					listUpdater?.(msg.rooms ?? []);
					return true;
				}
				if (msg.type === MSG.ROOM_STATE) {
					go(screenWaitingRoom(msg.room));
					return true;
				}
				if (msg.type === MSG.ERROR && ROOM_ERROR_MESSAGES[msg.code]) {
					go(screenRoomError(msg.code));
					return true;
				}
				return false;
			},
		};
	}

	function findMe(room) {
		const { clientId } = getIdentity();
		return room.members.find(m => m.clientId === clientId) ?? null;
	}

	function screenWaitingRoom(room) {
		const me = findMe(room);
		const localReady = me?.ready ?? false;
		const leave = () => {
			client?.send(roomLeave());
			go(screenOnlineMenu());
		};
		return {
			screen: 'waitingRoom',
			props: {
				room,
				localReady,
				onToggleReady: () => {
					client?.send(localReady ? roomUnready() : roomReady());
				},
				onLeave: leave,
			},
			onEscape: leave,
			onMessage: (msg) => {
				if (msg.type === MSG.ROOM_STATE) {
					if (msg.room.phase === 'ready') {
						go(screenHandoff(msg.room));
					} else {
						go(screenWaitingRoom(msg.room));
					}
					return true;
				}
				return false;
			},
		};
	}

	function screenHandoff(room) {
		const leave = () => {
			client?.send(roomLeave());
			go(screenOnlineMenu());
		};
		const confirm = async () => {
			await prepareGameplay();
			client?.send(roomConfirm());
		};
		const { clientId } = getIdentity();
		const canConfirm = room.members[0]?.clientId === clientId;
		const me = findMe(room);
		if (!canConfirm && !me?.confirmed) {
			prepareGameplay().then(() => {
				if (client && state?.screen === (isIOS() ? 'handoffIos' : 'handoffDesktop')) {
					client.send(roomConfirm());
				}
			}).catch((err) => {
				console.warn('gameplay preload failed', err);
			});
		}
		return {
			screen: isIOS() ? 'handoffIos' : 'handoffDesktop',
			props: {
				canConfirm,
				onContinue: confirm,
				onConfirm:  confirm,
			},
			onEscape: leave,
			onMessage: (msg) => {
				if (msg.type === MSG.ROOM_STATE) {
					if (msg.room.phase !== 'ready') {
						go(screenWaitingRoom(msg.room));
					}
					return true;
				}
				if (msg.type === MSG.ROOM_COUNTDOWN) {
					go(screenGameplay(msg.roomId ?? room.id));
					return true;
				}
				return false;
			},
		};
	}

	function screenGameplay(roomId) {
		let game = null;
		let audio = null;
		let disposed = false;
		let gameplayReady = false;
		let frameHandle = 0;
		let lastFrameTime = 0;
		const pendingMessages = [];
		function step(now) {
			if (disposed) return;
			if (game) {
				const dt = lastFrameTime === 0 ? 1 / 60 : Math.min((now - lastFrameTime) / 1000, 0.05);
				game.tick?.(dt);
				game.client.flushPending?.();
			}
			lastFrameTime = now;
			frameHandle = requestAnimationFrame(step);
		}
		(async () => {
			const { Game, createGameAudio, sound } = await prepareGameplay();
			if (disposed) return;
			initTouch({ target: root });
			game = new Game({ socket: client });
			frameHandle = requestAnimationFrame(step);
			audio = await createGameAudio({ sound });
			if (disposed) {
				audio.dispose();
				return;
			}
			audio.attach(game);
			gameplayReady = true;
			for (const msg of pendingMessages.splice(0)) {
				game.client.handleMessage(msg);
			}
		})();
		return {
			screen: 'gameplay',
			props: { roomId },
			onDispose: () => {
				disposed = true;
				if (frameHandle) cancelAnimationFrame(frameHandle);
				game?.dispose?.();
				disposeTouch();
				audio?.dispose();
			},
			onMessage: (msg) => {
				if (msg.type === MSG.GAME_START || msg.type === MSG.GAME_SNAPSHOT || msg.type === MSG.GAME_END) {
					if (game && gameplayReady) game.client.handleMessage(msg);
					else pendingMessages.push(msg);
					return true;
				}
				if (msg.type === MSG.ROOM_STATE) {
					if (msg.room.phase === 'waiting') {
						go(screenWaitingRoom(msg.room));
					}
					return true;
				}
				return false;
			},
		};
	}

	function screenRoomError(code) {
		const back = () => go(screenOnlineMenu());
		return {
			screen: 'roomError',
			props: {
				message: ROOM_ERROR_MESSAGES[code] ?? 'Unknown room error.',
				onBack: back,
			},
			onEscape: back,
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

	function screenSettings(wasOnline, focusField = 'name') {
		const back = () => go(wasOnline ? screenOnlineMenu() : screenOfflineMenu());
		const onIOS = isIOS();
		const subscribeVoicesChanged = (handler) => {
			if (typeof speechSynthesis === 'undefined' ||
				typeof speechSynthesis.addEventListener !== 'function') {
				return () => {};
			}
			const wrapped = () => handler(speechSynthesis.getVoices());
			speechSynthesis.addEventListener('voiceschanged', wrapped);
			return () => speechSynthesis.removeEventListener('voiceschanged', wrapped);
		};
		return {
			screen: 'settings',
			props: {
				name: getIdentity().name ?? '',
				isIOS: onIOS,
				mode: getSpeechMode(),
				voices: getVoices(),
				voiceURI: getVoice()?.voiceURI ?? null,
				rate: getRate(),
				pitch: getPitch(),
				focusField,
				subscribeVoicesChanged,
				onNameSave: (value) => {
					const trimmed = (value ?? '').trim();
					if (trimmed.length === 0) return;
					setDisplayName(trimmed);
				},
				generateName,
				onModeChange: (mode) => {
					setSpeechMode(mode);
					go(screenSettings(wasOnline, `mode-${mode}`));
				},
				onVoiceChange: (voiceURI) => {
					if (voiceURI) setVoice(voiceURI);
				},
				onRateChange: (value) => setRate(value),
				onPitchChange: (value) => setPitch(value),
				onTestVoice: () => speak(randomFact(), true),
				onBack: back,
			},
			onEscape: back,
		};
	}

	// ---- Incoming message router -----------------------------------------

	function onServerMessage(msg) {
		if (msg.type === MSG.WELCOME) {
			setIdentityFromWelcome(msg);
			if (!welcomeSeen) {
				welcomeSeen = true;
				playNotification('connect');
				go(screenOnlineMenu());
			}
			return;
		}
		if (state?.onMessage?.(msg)) return;
	}

	// ---- Boot ------------------------------------------------------------

	initSpeech();
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
