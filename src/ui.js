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
		mount(root, [
			el('h1', { text: `Room: ${props.room.id}` }),
			el('p', { text: `${props.room.mode} — ${props.room.pointLimit} points` }),
			el('ul', {}, ...props.room.members.map(m => el('li', {
				text: `${m.name}${m.ready ? ' (ready)' : ''}${m.connected ? '' : ' (offline)'}`,
			}))),
			el('button', {
				text: props.localReady ? 'Unready' : 'Ready',
				onClick: props.onToggleReady,
				autoFocus: true,
			}),
			el('button', { text: 'Leave', onClick: props.onLeave }),
		]);
	},

	handoffIos(root, props) {
		mount(root, [
			el('h1', { text: 'Almost ready' }),
			el('p', { text: 'VoiceOver interferes with gameplay gestures. Tap Continue, then turn off VoiceOver.' }),
			el('button', { text: 'Continue', onClick: props.onContinue, autoFocus: true }),
		]);
	},

	handoffDesktop(root, props) {
		mount(root, [
			el('h1', { text: 'Almost ready' }),
			el('p', { role: 'status', text: 'Press Enter when you are ready to begin.' }),
		]);
		const onKey = (e) => { if (e.key === 'Enter') props.onConfirm(); };
		window.addEventListener('keydown', onKey);
		// Caller can call dispose to remove this listener.
		root.__keyHandler = onKey;
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

	stubSettings(root, props) {
		mount(root, [
			el('h1', { text: 'Configure settings' }),
			el('p', { text: 'Not yet implemented.' }),
			el('button', { text: 'Back', onClick: props.onBack, autoFocus: true }),
		]);
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
			root.innerHTML = '';
		},
	};
}
