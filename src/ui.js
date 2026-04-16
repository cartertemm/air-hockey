// Declarative pre-game screens. Each screen is a function taking (root, props)
// that returns { dispose }. A small internal renderer wires up focus and event
// listeners so the screens themselves only describe structure.

function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'text') node.textContent = v;
		else if (k === 'autoFocus') { if (v) node.dataset.autofocus = 'true'; }
		else if (k.startsWith('on') && typeof v === 'function') {
			node.addEventListener(k.slice(2).toLowerCase(), v);
		} else if (v !== undefined && v !== null) {
			node.setAttribute(k, v);
		}
	}
	for (const c of children) {
		if (c == null) continue;
		node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return node;
}

function mount(root, nodes) {
	root.innerHTML = '';
	for (const n of nodes) root.appendChild(n);
	const autofocus = root.querySelector('[data-autofocus="true"]');
	autofocus?.focus();
}

// ---- Screens -------------------------------------------------------------

const SCREENS = {
	installPwaIos(root, props) {
		mount(root, [
			el('h1', { text: 'Install for the best experience' }),
			el('p', { text: 'It looks like this site is being visited in your browser. We highly recommend adding it to your home screen — the in-browser experience has address-bar clutter, inconsistent gesture handling with VoiceOver, and the audio can be suspended when the tab is backgrounded.' }),
			el('p', { text: 'To install: tap the Share button in the Safari toolbar, then choose Add to Home Screen. Launch the site from your home screen and it will run full-screen, like a native app.' }),
			el('button', { text: 'Continue anyway', onClick: props.onContinue, autoFocus: true }),
		]);
	},

	nameEntry(root, props) {
		const input = el('input', { id: 'name-input', type: 'text', autoFocus: true });
		const form = el('form', {
			onSubmit: (event) => {
				event.preventDefault();
				const value = input.value.trim();
				props.onSubmit(value.length === 0 ? null : value);
			},
		},
			el('h1', { text: 'Your name' }),
			el('label', { for: 'name-input', text: 'Display name' }),
			input,
			el('p', { text: 'Leave blank to generate a random name.' }),
			el('button', { type: 'submit', text: 'Continue' }),
		);
		mount(root, [form]);
	},

	mainMenu(root, props) {
		const heading = el('h1', { text: `Welcome, ${props.name}` });
		const buttons = props.connected
			? [
				el('button', { text: 'Create game',         onClick: props.onCreate,        autoFocus: true }),
				el('button', { text: 'Join game',           onClick: props.onJoin }),
				el('button', { text: 'Test speakers',       onClick: props.onTestSpeakers }),
				el('button', { text: 'Configure settings', onClick: props.onSettings }),
				el('button', { text: 'Disconnect',          onClick: props.onDisconnect }),
			]
			: [
				el('button', { text: 'Connect to server',   onClick: props.onConnect,       autoFocus: true }),
				el('button', { text: 'Test speakers',       onClick: props.onTestSpeakers }),
				el('button', { text: 'Configure settings', onClick: props.onSettings }),
			];
		mount(root, [heading, el('nav', {}, ...buttons)]);
	},

	connecting(root, props) {
		mount(root, [
			el('h1', { text: 'Connecting' }),
			el('p', { 'aria-live': 'polite', text: 'Connecting to server...' }),
			el('button', { text: 'Cancel', onClick: props.onCancel, autoFocus: true }),
		]);
	},

	connectFailed(root, props) {
		mount(root, [
			el('h1', { text: 'Connection failed' }),
			el('p', { role: 'alert', text: 'Could not reach the server.' }),
			el('button', { text: 'Retry',  onClick: props.onRetry, autoFocus: true }),
			el('button', { text: 'Cancel', onClick: props.onCancel }),
		]);
	},

	createGame(root, props) {
		const form = el('form', {
			onSubmit: (event) => {
				event.preventDefault();
				const mode = form.querySelector('input[name=mode]:checked').value;
				const pointLimit = parseInt(form.querySelector('input[name=points]:checked').value, 10);
				props.onSubmit({ mode, pointLimit });
			},
		},
			el('h1', { text: 'Create game' }),
			el('fieldset', {},
				el('legend', { text: 'Mode' }),
				el('label', {}, el('input', { type: 'radio', name: 'mode', value: 'single', checked: 'checked' }), ' Single match'),
				el('label', {}, el('input', { type: 'radio', name: 'mode', value: 'bestOf3' }), ' Best of 3'),
			),
			el('fieldset', {},
				el('legend', { text: 'Points to win' }),
				el('label', {}, el('input', { type: 'radio', name: 'points', value: '7', checked: 'checked' }), ' 7'),
				el('label', {}, el('input', { type: 'radio', name: 'points', value: '11' }), ' 11'),
			),
			el('button', { type: 'submit', text: 'Create', autoFocus: true }),
			el('button', { type: 'button', text: 'Cancel', onClick: props.onCancel }),
		);
		mount(root, [form]);
	},

	joinGame(root, props) {
		const list = el('ul');
		function render(rooms) {
			list.innerHTML = '';
			if (rooms.length === 0) {
				list.appendChild(el('li', { text: 'No rooms yet.' }));
				return;
			}
			for (const r of rooms) {
				list.appendChild(el('li', {},
					el('button', {
						text: `${r.hostName} — ${r.mode} — ${r.pointLimit} pts (${r.memberCount}/2)`,
						onClick: () => props.onPick(r.id),
						autoFocus: list.children.length === 0 ? true : undefined,
					}),
				));
			}
		}
		mount(root, [
			el('h1', { text: 'Join game' }),
			list,
			el('button', { text: 'Back', onClick: props.onBack }),
		]);
		render(props.rooms ?? []);
		props.onReady?.({ update: render });
	},

	waitingRoom(root, props) {
		const announcement = props.room.lastEventMessage
			? el('p', { role: 'status', 'aria-live': 'polite', text: props.room.lastEventMessage })
			: null;
		mount(root, [
			el('h1', { text: `Room: ${props.room.id}` }),
			el('p', { text: `${props.room.mode} — ${props.room.pointLimit} points` }),
			el('ul', {}, ...props.room.members.map(m => el('li', {
				text: `${m.name}${m.ready ? ' (ready)' : ''}${m.connected ? '' : ' (offline)'}`,
			}))),
			announcement,
			el('button', {
				text: props.localReady ? 'Unready' : 'Ready',
				onClick: props.onToggleReady,
				autoFocus: true,
			}),
			el('button', { text: 'Leave', onClick: props.onLeave }),
		].filter(Boolean));
	},

	roomError(root, props) {
		mount(root, [
			el('h1', { text: 'Room unavailable' }),
			el('p', { role: 'alert', 'aria-live': 'assertive', text: props.message }),
			el('button', { text: 'Back', onClick: props.onBack, autoFocus: true }),
		]);
	},

	countdown(root, props) {
		mount(root, [
			el('h1', { text: 'Starting' }),
			el('p', { 'aria-live': 'polite', text: `Starting in room ${props.roomId}…` }),
		]);
	},

	gameplay(root) {
		const region = el('main', { role: 'region', 'aria-label': 'gameplay' });
		root.innerHTML = '';
		root.appendChild(region);
	},

	handoffIos(root, props) {
		if (props.canConfirm) {
			mount(root, [
				el('h1', { text: 'Almost ready' }),
				el('p', { text: 'VoiceOver interferes with gameplay gestures. Tap Continue, then turn off VoiceOver.' }),
				el('button', { text: 'Continue', onClick: props.onContinue, autoFocus: true }),
			]);
			return;
		}
		mount(root, [
			el('h1', { text: 'Waiting for player 1' }),
			el('p', { role: 'status', text: 'Waiting for player 1 to start the game. Turn off VoiceOver before gameplay begins.' }),
		]);
	},

	handoffDesktop(root, props) {
		mount(root, props.canConfirm
			? [
				el('h1', { text: 'Almost ready' }),
				el('p', { role: 'status', text: 'Activate Continue or press Enter when you are ready to begin.' }),
				el('button', { text: 'Continue', onClick: props.onConfirm, autoFocus: true }),
			]
			: [
				el('h1', { text: 'Waiting for player 1' }),
				el('p', { role: 'status', text: 'Waiting for player 1 to start the game.' }),
			]);
		const onKey = (e) => { if (e.key === 'Enter') props.onConfirm(); };
		if (props.canConfirm) {
			window.addEventListener('keydown', onKey);
			// Caller can call dispose to remove this listener.
			root.__keyHandler = onKey;
		}
	},

	testSpeakers(root, props) {
		mount(root, [
			el('h1', { text: 'Test speakers' }),
			el('p', {
				'aria-live': 'polite',
				text: 'The first sound you will hear is on your left. The second sound, the puck landing, is on your right.',
			}),
			el('button', { text: 'Play test sound', onClick: props.onPlay, autoFocus: true }),
			el('button', { text: 'Back', onClick: props.onBack }),
		]);
	},

	settings(root, props) {
		const showOutputMode = !props.isIOS;
		const showVoiceControls = props.isIOS || props.mode === 'tts';
		const focus = props.focusField ?? 'name';
		// ---- Name field --------------------------------------------------
		const nameInput = el('input', {
			id: 'settings-name',
			type: 'text',
			value: props.name ?? '',
			autoFocus: focus === 'name' ? true : undefined,
		});
		const commitName = () => props.onNameSave(nameInput.value);
		nameInput.addEventListener('blur', commitName);
		nameInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				commitName();
			}
		});
		const generateButton = el('button', {
			type: 'button',
			text: 'Generate name',
			onClick: () => {
				const newName = props.generateName();
				nameInput.value = newName;
				props.onNameSave(newName);
				nameInput.focus();
			},
		});
		const nameBlock = el('div', {},
			el('label', { for: 'settings-name', text: 'Display name' }),
			nameInput,
			el('div', {}, el('span', { text: 'Feeling indecisive? ' }), generateButton),
			el('p', { id: 'settings-name-help', text: 'Saves when you press Enter or move focus away. Leave blank to keep your current name.' }),
		);
		// ---- Output mode (desktop only) ----------------------------------
		let modeBlock = null;
		if (showOutputMode) {
			const ariaRadio = el('input', {
				type: 'radio', name: 'speech-mode', value: 'aria', id: 'settings-mode-aria',
				checked: props.mode === 'aria' ? 'checked' : undefined,
				autoFocus: focus === 'mode-aria' ? true : undefined,
				onChange: (event) => { if (event.target.checked) props.onModeChange('aria'); },
			});
			const ttsRadio = el('input', {
				type: 'radio', name: 'speech-mode', value: 'tts', id: 'settings-mode-tts',
				checked: props.mode === 'tts' ? 'checked' : undefined,
				autoFocus: focus === 'mode-tts' ? true : undefined,
				onChange: (event) => { if (event.target.checked) props.onModeChange('tts'); },
			});
			modeBlock = el('fieldset', {},
				el('legend', { text: 'Speech output' }),
				el('label', { for: 'settings-mode-aria' }, ariaRadio, ' Screen reader'),
				el('label', { for: 'settings-mode-tts' }, ttsRadio, ' Text to speech'),
			);
		}
		// ---- Voice / rate / pitch / preview ------------------------------
		let voiceBlock = null;
		if (showVoiceControls) {
			const select = el('select', {
				id: 'settings-voice',
				onChange: (event) => props.onVoiceChange(event.target.value),
			});
			function populateVoices(voices) {
				select.innerHTML = '';
				const known = voices.some(v => v.voiceURI === props.voiceURI);
				if (props.voiceURI && !known) {
					const opt = document.createElement('option');
					opt.value = props.voiceURI;
					opt.textContent = '(unknown voice)';
					opt.disabled = true;
					opt.selected = true;
					select.appendChild(opt);
				}
				if (voices.length === 0 && !props.voiceURI) {
					const opt = document.createElement('option');
					opt.value = '';
					opt.textContent = '(no voices available)';
					opt.disabled = true;
					opt.selected = true;
					select.appendChild(opt);
				}
				for (const v of voices) {
					const opt = document.createElement('option');
					opt.value = v.voiceURI;
					opt.textContent = v.name;
					if (v.voiceURI === props.voiceURI) opt.selected = true;
					select.appendChild(opt);
				}
			}
			populateVoices(props.voices ?? []);
			const fmt = (n) => Number(n).toFixed(1);
			const rateInput = el('input', {
				id: 'settings-rate', type: 'range',
				min: '0.5', max: '2', step: '0.1',
				value: String(props.rate),
				'aria-valuetext': fmt(props.rate),
				onChange: (event) => {
					const v = parseFloat(event.target.value);
					event.target.setAttribute('aria-valuetext', fmt(v));
					props.onRateChange(v);
				},
				onInput: (event) => {
					event.target.setAttribute('aria-valuetext', fmt(parseFloat(event.target.value)));
				},
			});
			const pitchInput = el('input', {
				id: 'settings-pitch', type: 'range',
				min: '0.1', max: '2', step: '0.1',
				value: String(props.pitch),
				'aria-valuetext': fmt(props.pitch),
				onChange: (event) => {
					const v = parseFloat(event.target.value);
					event.target.setAttribute('aria-valuetext', fmt(v));
					props.onPitchChange(v);
				},
				onInput: (event) => {
					event.target.setAttribute('aria-valuetext', fmt(parseFloat(event.target.value)));
				},
			});
			voiceBlock = el('div', {},
				el('label', { for: 'settings-voice', text: 'Voice' }),
				select,
				el('label', { for: 'settings-rate', text: 'Speech rate' }),
				rateInput,
				el('label', { for: 'settings-pitch', text: 'Speech pitch' }),
				pitchInput,
				// Settings is the one pre-game screen that calls speak() directly:
				// the user is deliberately previewing TTS, so the "pre-game uses
				// native screen reader" rule does not apply here.
				el('button', { type: 'button', text: 'Test voice', onClick: props.onTestVoice }),
			);
			const unsub = props.subscribeVoicesChanged?.((newVoices) => populateVoices(newVoices));
			if (typeof unsub === 'function') root.__cleanup = unsub;
		}
		const backButton = el('button', { type: 'button', text: 'Back', onClick: props.onBack });
		mount(root, [
			el('h1', { text: 'Configure settings' }),
			nameBlock,
			modeBlock,
			voiceBlock,
			backButton,
		].filter(Boolean));
	},
};

// ---- Public renderer -----------------------------------------------------

export function renderScreen(root, id, props = {}) {
	const screen = SCREENS[id];
	if (!screen) throw new Error(`unknown screen: ${id}`);
	screen(root, props);
	return {
		dispose() {
			if (root.__keyHandler) {
				window.removeEventListener('keydown', root.__keyHandler);
				delete root.__keyHandler;
			}
			if (root.__cleanup) {
				try { root.__cleanup(); } catch { /* ignore */ }
				delete root.__cleanup;
			}
			root.innerHTML = '';
		},
	};
}
