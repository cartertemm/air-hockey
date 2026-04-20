import { describe, test, expect, beforeEach } from 'vitest';
import { renderScreen } from '../src/ui.js';

function setupRoot() {
	const root = document.createElement('main');
	document.body.appendChild(root);
	return root;
}

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('renderScreen', () => {
	test('mounts a heading and a focused button', () => {
		const root = setupRoot();
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: false,
			onConnect: () => {},
			onTestSpeakers: () => {},
			onSettings: () => {},
		});
		expect(root.querySelector('h1').textContent).toBe('Welcome, Swift Otter');
		const first = root.querySelector('button');
		expect(first.textContent).toBe('Connect to server');
		expect(document.activeElement).toBe(first);
	});

	test('mainMenu online mode shows Create/Join/Disconnect', () => {
		const root = setupRoot();
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: true,
			onCreate: () => {}, onJoin: () => {},
			onTestSpeakers: () => {}, onSettings: () => {}, onDisconnect: () => {},
		});
		const labels = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(labels).toEqual([
			'Create game', 'Join game', 'Test speakers', 'Configure settings', 'Disconnect',
		]);
	});

	test('button click invokes the provided handler', () => {
		const root = setupRoot();
		let clicked = false;
		renderScreen(root, 'mainMenu', {
			name: 'x', connected: false,
			onConnect: () => { clicked = true; },
			onTestSpeakers: () => {}, onSettings: () => {},
		});
		root.querySelector('button').click();
		expect(clicked).toBe(true);
	});

	test('nameEntry: blank input calls onSubmit with null', () => {
		const root = setupRoot();
		let submitted;
		renderScreen(root, 'nameEntry', { onSubmit: v => { submitted = v; } });
		root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
		expect(submitted).toBeNull();
	});

	test('nameEntry: filled input calls onSubmit with the value', () => {
		const root = setupRoot();
		let submitted;
		renderScreen(root, 'nameEntry', { onSubmit: v => { submitted = v; } });
		const input = root.querySelector('input');
		input.value = 'Swift Otter';
		root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
		expect(submitted).toBe('Swift Otter');
	});

	test('returned dispose() removes the rendered content', () => {
		const root = setupRoot();
		const { dispose } = renderScreen(root, 'connecting', { onCancel: () => {} });
		expect(root.childElementCount).toBeGreaterThan(0);
		dispose();
		expect(root.childElementCount).toBe(0);
	});

	test('connectFailed: Retry and Cancel buttons', () => {
		const root = setupRoot();
		let retried = false;
		let cancelled = false;
		renderScreen(root, 'connectFailed', {
			onRetry: () => { retried = true; },
			onCancel: () => { cancelled = true; },
		});
		const buttons = [...root.querySelectorAll('button')];
		expect(buttons.map(b => b.textContent)).toEqual(['Retry', 'Cancel']);
		buttons[0].click();
		buttons[1].click();
		expect(retried).toBe(true);
		expect(cancelled).toBe(true);
	});

	test('handoffDesktop renders a Continue button and focuses it', () => {
		const root = setupRoot();
		let confirmed = 0;
		renderScreen(root, 'handoffDesktop', {
			canConfirm: true,
			onConfirm: () => { confirmed++; },
		});
		expect(root.querySelector('h1').textContent).toBe('Almost ready');
		expect(root.querySelector('p').textContent).toMatch(/Continue/);
		const button = root.querySelector('button');
		expect(button.textContent).toBe('Continue');
		expect(document.activeElement).toBe(button);
		button.click();
		expect(confirmed).toBe(1);
	});

	test('handoffDesktop hides Continue for the waiting player', () => {
		const root = setupRoot();
		renderScreen(root, 'handoffDesktop', {
			canConfirm: false,
			onConfirm: () => {},
		});
		expect(root.querySelector('h1').textContent).toBe('Waiting for player 1');
		expect(root.querySelector('p').textContent).toMatch(/Waiting for player 1/);
		expect(root.querySelector('button')).toBeNull();
	});
});

describe('localHost screen', () => {
	test('renders point limit form with Host and Cancel buttons', () => {
		const root = setupRoot();
		renderScreen(root, 'localHost', {
			onSubmit: () => {},
			onCancel: () => {},
		});
		expect(root.querySelector('h1').textContent).toBe('Host locally');
		const radios = [...root.querySelectorAll('input[name=points]')];
		expect(radios.map(r => r.value)).toEqual(['7', '11']);
		expect(radios[0].checked).toBe(true);
		const buttons = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(buttons).toEqual(['Host', 'Cancel']);
	});

	test('submitting calls onSubmit with selected point limit', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'localHost', {
			onSubmit: (v) => calls.push(v),
			onCancel: () => {},
		});
		root.querySelector('input[name=points][value="11"]').checked = true;
		root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
		expect(calls).toEqual([{ pointLimit: 11 }]);
	});
});

describe('localWaiting screen', () => {
	test('renders room code, invite link, copy button, waiting message, and cancel', () => {
		const root = setupRoot();
		renderScreen(root, 'localWaiting', {
			roomCode: 'swift-otter-42',
			inviteLink: 'http://localhost/#join=swift-otter-42',
			onCancel: () => {},
		});
		expect(root.querySelector('h1').textContent).toBe('Local game');
		expect(root.textContent).toContain('swift-otter-42');
		expect(root.textContent).toContain('http://localhost/#join=swift-otter-42');
		const buttons = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(buttons).toContain('Copy link');
		expect(buttons).toContain('Cancel');
		expect(root.textContent).toContain('Waiting for opponent...');
	});
});

describe('joining screen', () => {
	test('renders joining message with room code and cancel button', () => {
		const root = setupRoot();
		renderScreen(root, 'joining', {
			roomCode: 'brave-falcon-7',
			onCancel: () => {},
		});
		expect(root.querySelector('h1').textContent).toBe('Joining game');
		expect(root.textContent).toContain('brave-falcon-7');
		const buttons = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(buttons).toEqual(['Cancel']);
	});
});

describe('mainMenu with local hosting', () => {
	test('shows Host locally button when onHostLocal is provided', () => {
		const root = setupRoot();
		let hostClicked = false;
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: false,
			onHostLocal: () => { hostClicked = true; },
			onConnect: () => {},
			onTestSpeakers: () => {},
			onSettings: () => {},
		});
		const hostBtn = [...root.querySelectorAll('button')].find(b => b.textContent === 'Host locally');
		expect(hostBtn).toBeTruthy();
		hostBtn.click();
		expect(hostClicked).toBe(true);
	});

	test('Host locally is autofocused when present', () => {
		const root = setupRoot();
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: false,
			onHostLocal: () => {},
			onConnect: () => {},
			onTestSpeakers: () => {},
			onSettings: () => {},
		});
		expect(document.activeElement.textContent).toBe('Host locally');
	});

	test('shows status message when serverStatus is unreachable', () => {
		const root = setupRoot();
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: false,
			serverStatus: 'unreachable',
			onHostLocal: () => {},
			onConnect: () => {},
			onTestSpeakers: () => {},
			onSettings: () => {},
		});
		const alert = root.querySelector('[role="alert"]');
		expect(alert).toBeTruthy();
		expect(alert.textContent).toMatch(/Server unreachable/);
		expect(alert.getAttribute('aria-live')).toBe('assertive');
	});

	test('no status message when serverStatus is not unreachable', () => {
		const root = setupRoot();
		renderScreen(root, 'mainMenu', {
			name: 'Swift Otter',
			connected: false,
			onHostLocal: () => {},
			onConnect: () => {},
			onTestSpeakers: () => {},
			onSettings: () => {},
		});
		expect(root.querySelector('[role="alert"]')).toBeNull();
	});
});

function defaultSettingsProps(overrides = {}) {
	return {
		name: 'Swift Otter',
		isIOS: false,
		mode: 'aria',
		voices: [],
		voiceURI: null,
		rate: 1,
		pitch: 1,
		focusField: 'name',
		generateName: () => 'Random Name',
		onNameSave: () => {},
		onModeChange: () => {},
		onVoiceChange: () => {},
		onRateChange: () => {},
		onPitchChange: () => {},
		onTestVoice: () => {},
		onBack: () => {},
		...overrides,
	};
}

describe('settings screen', () => {
	test('desktop with mode=aria shows name + radios + back, no voice controls', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps());
		expect(root.querySelector('h1').textContent).toBe('Configure settings');
		expect(root.querySelector('#settings-name')).toBeTruthy();
		expect(root.querySelector('#settings-mode-aria')).toBeTruthy();
		expect(root.querySelector('#settings-mode-tts')).toBeTruthy();
		expect(root.querySelector('#settings-voice')).toBeNull();
		expect(root.querySelector('#settings-rate')).toBeNull();
		expect(root.querySelector('#settings-pitch')).toBeNull();
		const buttons = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(buttons).toEqual(['Generate name', 'Back']);
	});

	test('desktop with mode=tts shows voice controls and Test voice button', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps({ mode: 'tts' }));
		expect(root.querySelector('#settings-voice')).toBeTruthy();
		expect(root.querySelector('#settings-rate')).toBeTruthy();
		expect(root.querySelector('#settings-pitch')).toBeTruthy();
		const buttons = [...root.querySelectorAll('button')].map(b => b.textContent);
		expect(buttons).toEqual(['Generate name', 'Test voice', 'Back']);
	});

	test('iOS always shows voice controls and hides output mode', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps({ isIOS: true, mode: 'tts' }));
		expect(root.querySelector('#settings-mode-aria')).toBeNull();
		expect(root.querySelector('#settings-mode-tts')).toBeNull();
		expect(root.querySelector('#settings-voice')).toBeTruthy();
		expect(root.querySelector('#settings-rate')).toBeTruthy();
		expect(root.querySelector('#settings-pitch')).toBeTruthy();
	});

	test('selected radio reflects current mode', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps({ mode: 'tts' }));
		expect(root.querySelector('#settings-mode-tts').checked).toBe(true);
		expect(root.querySelector('#settings-mode-aria').checked).toBe(false);
	});

	test('changing the mode radio invokes onModeChange', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			mode: 'aria',
			onModeChange: (m) => calls.push(m),
		}));
		const ttsRadio = root.querySelector('#settings-mode-tts');
		ttsRadio.checked = true;
		ttsRadio.dispatchEvent(new Event('change', { bubbles: true }));
		expect(calls).toEqual(['tts']);
	});

	test('blurring the name input commits via onNameSave', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			onNameSave: (v) => calls.push(v),
		}));
		const input = root.querySelector('#settings-name');
		input.value = 'Bouncy Puck';
		input.dispatchEvent(new Event('blur'));
		expect(calls).toEqual(['Bouncy Puck']);
	});

	test('Enter on the name input commits without submitting a form', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			onNameSave: (v) => calls.push(v),
		}));
		const input = root.querySelector('#settings-name');
		input.value = 'Speedy Mallet';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(calls).toEqual(['Speedy Mallet']);
	});

	test('voice select lists provided voices and reflects current selection', () => {
		const root = setupRoot();
		const voices = [
			{ name: 'Alpha', voiceURI: 'a' },
			{ name: 'Beta',  voiceURI: 'b' },
		];
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			voices,
			voiceURI: 'b',
		}));
		const select = root.querySelector('#settings-voice');
		const options = [...select.querySelectorAll('option')];
		expect(options.map(o => o.textContent)).toEqual(['Alpha', 'Beta']);
		expect(options.find(o => o.selected).textContent).toBe('Beta');
	});

	test('voice select shows an "(unknown voice)" placeholder when persisted voice is missing', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			voices: [{ name: 'Alpha', voiceURI: 'a' }],
			voiceURI: 'gone',
		}));
		const select = root.querySelector('#settings-voice');
		const labels = [...select.querySelectorAll('option')].map(o => o.textContent);
		expect(labels).toContain('(unknown voice)');
	});

	test('changing the voice select invokes onVoiceChange with the new URI', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			voices: [
				{ name: 'Alpha', voiceURI: 'a' },
				{ name: 'Beta',  voiceURI: 'b' },
			],
			voiceURI: 'a',
			onVoiceChange: (v) => calls.push(v),
		}));
		const select = root.querySelector('#settings-voice');
		select.value = 'b';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(calls).toEqual(['b']);
	});

	test('rate slider reads aria-valuetext and reports new values via onRateChange', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			rate: 1,
			onRateChange: (v) => calls.push(v),
		}));
		const slider = root.querySelector('#settings-rate');
		expect(slider.getAttribute('aria-valuetext')).toBe('1.0');
		slider.value = '1.5';
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		expect(calls).toEqual([1.5]);
		expect(slider.getAttribute('aria-valuetext')).toBe('1.5');
	});

	test('pitch slider reports new values via onPitchChange', () => {
		const root = setupRoot();
		const calls = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			pitch: 1,
			onPitchChange: (v) => calls.push(v),
		}));
		const slider = root.querySelector('#settings-pitch');
		slider.value = '0.7';
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		expect(calls).toEqual([0.7]);
	});

	test('Test voice button invokes onTestVoice', () => {
		const root = setupRoot();
		let pressed = 0;
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			onTestVoice: () => { pressed++; },
		}));
		const test = [...root.querySelectorAll('button')].find(b => b.textContent === 'Test voice');
		test.click();
		expect(pressed).toBe(1);
	});

	test('"Feeling indecisive?" text appears near the name field', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps());
		expect(root.textContent).toMatch(/Feeling indecisive\?/);
	});

	test('Generate name button populates the input, saves, and refocuses it', () => {
		const root = setupRoot();
		const saved = [];
		renderScreen(root, 'settings', defaultSettingsProps({
			name: 'Old Name',
			generateName: () => 'Shiny Puck',
			onNameSave: (v) => saved.push(v),
		}));
		const input = root.querySelector('#settings-name');
		const generate = [...root.querySelectorAll('button')].find(b => b.textContent === 'Generate name');
		generate.click();
		expect(input.value).toBe('Shiny Puck');
		expect(saved).toEqual(['Shiny Puck']);
		expect(document.activeElement).toBe(input);
	});

	test('Back button invokes onBack', () => {
		const root = setupRoot();
		let backed = 0;
		renderScreen(root, 'settings', defaultSettingsProps({
			onBack: () => { backed++; },
		}));
		const back = [...root.querySelectorAll('button')].find(b => b.textContent === 'Back');
		back.click();
		expect(backed).toBe(1);
	});

	test('focusField "mode-tts" focuses the TTS radio after mount', () => {
		const root = setupRoot();
		renderScreen(root, 'settings', defaultSettingsProps({
			mode: 'tts',
			focusField: 'mode-tts',
		}));
		expect(document.activeElement).toBe(root.querySelector('#settings-mode-tts'));
	});

	test('subscribeVoicesChanged repopulates the select when voices update', () => {
		const root = setupRoot();
		let pushHandler = null;
		const subscribe = (handler) => {
			pushHandler = handler;
			return () => { pushHandler = null; };
		};
		renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			voices: [],
			subscribeVoicesChanged: subscribe,
		}));
		expect(pushHandler).toBeTypeOf('function');
		pushHandler([
			{ name: 'Alpha', voiceURI: 'a' },
			{ name: 'Beta',  voiceURI: 'b' },
		]);
		const labels = [...root.querySelectorAll('#settings-voice option')].map(o => o.textContent);
		expect(labels).toEqual(['Alpha', 'Beta']);
	});

	test('dispose unsubscribes the voiceschanged handler', () => {
		const root = setupRoot();
		let subscribed = 0;
		let unsubscribed = 0;
		const subscribe = () => { subscribed++; return () => { unsubscribed++; }; };
		const { dispose } = renderScreen(root, 'settings', defaultSettingsProps({
			isIOS: true,
			subscribeVoicesChanged: subscribe,
		}));
		expect(subscribed).toBe(1);
		dispose();
		expect(unsubscribed).toBe(1);
	});
});
