// One-sentence facts about air hockey, sourced from
// https://en.wikipedia.org/wiki/Air_hockey. Used by the Settings screen's
// "Test voice" button so the user hears something interesting (and varies
// each press) when previewing TTS settings.

export const AIR_HOCKEY_FACTS = [
	'Air hockey is a tabletop sport where two players try to score goals on a low-friction table using hand-held discs and a lightweight plastic puck.',
	'The air hockey table suspends the puck on a thin cushion of air ejected from tiny vent holes in its surface.',
	'Air tables originated in the 1940s as a conveyor technology for sliding heavy objects like cardboard boxes across a surface.',
	'John Stull, a professor at Alfred University, created an early low-friction air track in the 1960s using a vacuum cleaner under a perforated surface.',
	'Sega released an arcade game called MotoPolo in 1968 in which players moved miniature motorbikes to knock balls into opponents goals.',
	'Air hockey was created by a group of Brunswick Billiards employees between 1969 and 1972.',
	'Brunswick engineers Phil Crossman, Bob Kenrick, and Brad Baldwin played key roles in developing the first air hockey table.',
	'Bob Lemieux revived the Brunswick air hockey project and added the abstracted ice hockey design with two strikers and slit-like goals.',
	'By the mid 1970s, air hockey had become an immediate financial success and generated strong interest in tournament play.',
	'As early as 1973, players in Houston formed the Houston Air Hockey Association to codify rules and promote the sport.',
	'The United States Air Hockey Association, or USAA, was founded in 1975 by J. Phillip Arnold as the official sanctioning body for the sport.',
	'The Air Hockey Players Association, or AHPA, was announced in March 2015 as a second organization overseeing the sport.',
	'Colin Cummings of Beaumont, Texas became the youngest world champion in air hockey history at age sixteen.',
	'Colin Cummings won the USAA World Championship five years in a row from 2019 through 2023.',
	'Tim Weissman won the USAA World Championship eight times between 1989 and 1996.',
	'Danny Hynes won the USAA World Championship seven times between 2001 and 2013.',
	'Jesse Douty won five USAA World Championships between 1978 and 1982.',
	'Professional air hockey in the United States has four main scenes: Houston, North Carolina, Chicago, and Boise.',
	'Barcelona, Saint Petersburg, Moscow, and the Czech cities of Most and Brno are major international centers for the sport.',
	'Only eight-foot tables are approved for tournament play by the USAA and AHPA.',
	'Tournament-approved air hockey pucks are made of Lexan polycarbonate resin and come in yellow, red, and green.',
	'Air hockey mallets are also called goalies, strikers, or paddles, and consist of a simple handle on top of a flat surface.',
	'A player has seven seconds to take a shot and ten seconds to put the puck back into play after being scored on.',
	'Players are not allowed to touch the puck with their hands, and using hands to block a goal is prohibited.',
	'Air hockey mallets are gripped behind the knob with the fingertips rather than held on top, allowing greater wrist action.',
];

export function randomFact() {
	const i = Math.floor(Math.random() * AIR_HOCKEY_FACTS.length);
	return AIR_HOCKEY_FACTS[i];
}
