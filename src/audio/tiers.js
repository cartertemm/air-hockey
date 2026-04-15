export const MALLET_HIT_TIER_1_THRESHOLD = 90;
export const MALLET_HIT_TIER_2_THRESHOLD = 45;
export const WALL_BOUNCE_HARD_THRESHOLD = 60;
export const GOAL_TIER_THRESHOLDS = [120, 90, 60, 30];

export function malletHitTier(speed) {
	if (speed > MALLET_HIT_TIER_1_THRESHOLD) return 1;
	if (speed > MALLET_HIT_TIER_2_THRESHOLD) return 2;
	return 3;
}

export function wallBounceTier(speed) {
	return speed > WALL_BOUNCE_HARD_THRESHOLD ? 'hard' : 'soft';
}

export function goalTier(speed) {
	const t = GOAL_TIER_THRESHOLDS;
	if (speed > t[0]) return 1;
	if (speed > t[1]) return 2;
	if (speed > t[2]) return 3;
	if (speed > t[3]) return 4;
	return 5;
}
