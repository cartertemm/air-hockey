const ADJECTIVES = [
	'Swift', 'Brave', 'Quiet', 'Bright', 'Calm',  'Wild',
	'Bold',  'Sharp', 'Clever','Noble',  'Lucky', 'Merry',
	'Silent','Gentle','Fierce','Proud',  'Kind',  'Steady',
	'Eager', 'Mellow','Happy', 'Jolly',  'Witty', 'Sunny',
	'Dusky', 'Misty', 'Golden','Silver', 'Frosty','Rustic',
];

const NOUNS = [
	'Otter',  'Falcon', 'Comet',  'Ember',  'River',  'Spark',
	'Raven',  'Badger', 'Willow', 'Meadow', 'Canyon', 'Harbor',
	'Thunder','Cedar',  'Maple',  'Hawk',   'Fern',   'Stone',
	'Cloud',  'Quartz', 'Breeze', 'Brook',  'Moss',   'Dune',
	'Glade',  'Ridge',  'Vale',   'Pine',   'Lark',   'Hollow',
];

export function generateName() {
	const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${a} ${n}`;
}
