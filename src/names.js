const ADJECTIVES = [
	'Swift',   'Brave',   'Quiet',   'Bright',  'Calm',    'Wild',
	'Bold',    'Sharp',   'Clever',  'Noble',   'Lucky',   'Merry',
	'Silent',  'Gentle',  'Fierce',  'Proud',   'Kind',    'Steady',
	'Eager',   'Mellow',  'Happy',   'Jolly',   'Witty',   'Sunny',
	'Dusky',   'Misty',   'Golden',  'Silver',  'Frosty',  'Rustic',
	'Amber',   'Crimson', 'Azure',   'Emerald', 'Ivory',   'Onyx',
	'Velvet',  'Cosmic',  'Stellar', 'Lunar',   'Solar',   'Nimble',
	'Daring',  'Valiant', 'Loyal',   'Humble',  'Cheery',  'Breezy',
	'Dapper',  'Spry',    'Zesty',   'Snappy',  'Plucky',  'Feisty',
	'Rowdy',   'Cozy',    'Dreamy',  'Drifty',  'Hushed',  'Murky',
	'Shady',   'Stormy',  'Sleepy',  'Tangy',   'Toasty',  'Wintry',
	'Autumn',  'Summer',  'Vernal',  'Arctic',  'Tropic',  'Alpine',
	'Hidden',  'Ancient', 'Mighty',  'Tiny',    'Giant',   'Quick',
	'Slick',   'Smooth',  'Rough',   'Polished','Wooden',  'Marble',
	'Crystal', 'Shadow',  'Hollow',  'Radiant', 'Gleaming','Glowing',
	'Dashing', 'Roaming', 'Wandering','Restless','Patient','Rugged',
];

const NOUNS = [
	'Otter',    'Falcon',   'Comet',    'Ember',    'River',    'Spark',
	'Raven',    'Badger',   'Willow',   'Meadow',   'Canyon',   'Harbor',
	'Thunder',  'Cedar',    'Maple',    'Hawk',     'Fern',     'Stone',
	'Cloud',    'Quartz',   'Breeze',   'Brook',    'Moss',     'Dune',
	'Glade',    'Ridge',    'Vale',     'Pine',     'Lark',     'Grove',
	'Fox',      'Wolf',     'Bear',     'Lynx',     'Puma',     'Stag',
	'Heron',    'Sparrow',  'Finch',    'Swan',     'Owl',      'Eagle',
	'Panda',    'Koala',    'Rabbit',   'Mole',     'Vole',     'Hare',
	'Salmon',   'Trout',    'Marlin',   'Dolphin',  'Whale',    'Seal',
	'Aspen',    'Birch',    'Oak',      'Elm',      'Yew',      'Alder',
	'Juniper',  'Hazel',    'Clover',   'Thistle',  'Iris',     'Poppy',
	'Rose',     'Lily',     'Violet',   'Daisy',    'Orchid',   'Lotus',
	'Mountain', 'Valley',   'Prairie',  'Desert',   'Forest',   'Island',
	'Bay',      'Lagoon',   'Cove',     'Reef',     'Tide',     'Wave',
	'Nova',     'Star',     'Galaxy',   'Nebula',   'Eclipse',  'Aurora',
	'Dusk',     'Dawn',     'Twilight', 'Sunset',   'Horizon',  'Zenith',
	'Flame',    'Ash',      'Cinder',   'Blaze',    'Frost',    'Glacier',
	'Storm',    'Gale',     'Mist',     'Fog',      'Rain',     'Snow',
];

export function generateName() {
	const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${a} ${n}`;
}
