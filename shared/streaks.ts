export type CalloutTone = "gold" | "blue" | "red";

export interface StreakMilestone {
  streak: number;
  title: string;
  subtitle: string;
  tone: CalloutTone;
  bonusScore: number;
}

export const MULTI_KILL_WINDOW = 4;
export const MULTI_KILL_BONUS = 25;

export const STREAK_MILESTONES: StreakMilestone[] = [
  { streak: 3, title: "KILLING SPREE", subtitle: "RAPID FIRE · 10S", tone: "gold", bonusScore: 50 },
  { streak: 5, title: "ACE", subtitle: "ARMOUR PLATE +35", tone: "blue", bonusScore: 100 },
  { streak: 7, title: "UNSTOPPABLE", subtitle: "HULL REPAIRED +45", tone: "gold", bonusScore: 150 },
  { streak: 10, title: "TOY LEGEND", subtitle: "ROCKETS RELOADED", tone: "red", bonusScore: 300 },
];

export function streakMilestone(streak: number): StreakMilestone | undefined {
  return STREAK_MILESTONES.find((milestone) => milestone.streak === streak);
}

export function multiKillTitle(count: number): string | null {
  if (count === 2) return "DOUBLE KILL";
  if (count === 3) return "TRIPLE KILL";
  if (count >= 4) return "MULTI KILL";
  return null;
}
