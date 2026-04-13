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
});
