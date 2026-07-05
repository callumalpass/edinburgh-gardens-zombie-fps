export const AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES = 6.4;
export const AUSTRALIAN_RULES_BEHIND_POST_OFFSET_METRES = 6.4;
export const AUSTRALIAN_RULES_FULL_GOAL_WIDTH_METRES =
  AUSTRALIAN_RULES_GOAL_POST_SPACING_METRES + AUSTRALIAN_RULES_BEHIND_POST_OFFSET_METRES * 2;
export const AUSTRALIAN_RULES_GOAL_POST_HEIGHT_METRES = 6;
export const AUSTRALIAN_RULES_BEHIND_POST_HEIGHT_METRES = 3;
export const BASKETBALL_RIM_HEIGHT_METRES = 3.05;
export const BASKETBALL_BACKBOARD_WIDTH_METRES = 1.83;

export function footballPostLocalOffsets(totalWidth: number): [number, number, number, number] {
  const goalPostHalfWidth = totalWidth / 6;
  const behindPostHalfWidth = totalWidth / 2;
  return [-behindPostHalfWidth, -goalPostHalfWidth, goalPostHalfWidth, behindPostHalfWidth];
}
