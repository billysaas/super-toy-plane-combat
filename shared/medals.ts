export interface MatchStats {
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  rocketsFired: number;
  rocketHits: number;
  balloonsPopped: number;
  bestStreak: number;
  longestLife: number;
}

export function createMatchStats(): MatchStats {
  return {
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    rocketsFired: 0,
    rocketHits: 0,
    balloonsPopped: 0,
    bestStreak: 0,
    longestLife: 0,
  };
}

export function shotAccuracy(stats: MatchStats): number {
  return stats.shotsFired > 0 ? Math.min(1, stats.shotsHit / stats.shotsFired) : 0;
}

export function medalsFor(stats: MatchStats, kills: number, deaths: number): string[] {
  const medals: string[] = [];
  if (kills >= 10) medals.push("CENTURION");
  if (stats.bestStreak >= 7) medals.push("UNSTOPPABLE");
  else if (stats.bestStreak >= 5) medals.push("ACE");
  if (deaths === 0 && kills >= 3) medals.push("UNTOUCHED");
  if (stats.balloonsPopped >= 4) medals.push("BALLOON BUSTER");
  if (stats.rocketHits >= 2) medals.push("ROCKET ACE");
  if (stats.damageDealt >= 450) medals.push("HEAVY HITTER");
  const accuracy = shotAccuracy(stats);
  if (stats.shotsFired >= 40 && accuracy >= 0.32) medals.push("SHARPSHOOTER");
  return medals;
}
