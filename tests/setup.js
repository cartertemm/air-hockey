// Mock speechSynthesis — happy-dom does not provide it.
class MockUtterance {
	constructor(text) {
		this.text = text;
	}
}

class MockSpeechSynthesis {
	constructor() {
		this.spoken = [];
		this.cancelCalls = 0;
	}
	speak(utterance) {
		this.spoken.push(utterance.text);
	}
	cancel() {
		this.cancelCalls += 1;
	}
	reset() {
		this.spoken = [];
		this.cancelCalls = 0;
	}
}

globalThis.SpeechSynthesisUtterance = MockUtterance;
globalThis.speechSynthesis = new MockSpeechSynthesis();

// Mock localStorage — Node 22+ ships an experimental global `localStorage`
// stub that shadows happy-dom's implementation and lacks setItem/getItem/clear.
// Install a working in-memory Storage so tests (and modules under test) can use it.
class MockStorage {
	constructor() {
		this.store = {};
	}
	get length() {
		return Object.keys(this.store).length;
	}
	key(index) {
		const keys = Object.keys(this.store);
		return index < keys.length ? keys[index] : null;
	}
	getItem(name) {
		return Object.prototype.hasOwnProperty.call(this.store, name) ? this.store[name] : null;
	}
	setItem(name, value) {
		this.store[name] = String(value);
	}
	removeItem(name) {
		delete this.store[name];
	}
	clear() {
		this.store = {};
	}
}

const mockLocalStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});
if (typeof window !== 'undefined') {
	Object.defineProperty(window, 'localStorage', {
		value: mockLocalStorage,
		writable: true,
		configurable: true,
	});
}

// Reset between tests so assertions don't leak.
import { beforeEach } from 'vitest';
beforeEach(() => {
	globalThis.speechSynthesis.reset();
	document.body.innerHTML = '';
	localStorage.clear();
});
