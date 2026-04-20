const ADJECTIVES = ['swift', 'brave', 'quiet', 'bright', 'calm', 'wild'];
const NOUNS      = ['otter', 'falcon', 'comet', 'ember', 'river', 'spark'];

export function mintRoomId(existingIds) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
		const n   = NOUNS[Math.floor(Math.random() * NOUNS.length)];
		const id = `${adj}-${n}-${Math.floor(Math.random() * 1000)}`;
		if (!existingIds?.has(id)) return id;
	}
	throw new Error('mintRoomId: failed to find a unique id');
}
