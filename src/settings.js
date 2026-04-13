const PREFIX = 'airhockey:';

export function get(key, defaultValue = undefined) {
	const raw = localStorage.getItem(PREFIX + key);
	if (raw === null) return defaultValue;
	try {
		return JSON.parse(raw);
	} catch {
		return defaultValue;
	}
}

export function set(key, value) {
	localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
	localStorage.removeItem(PREFIX + key);
}
