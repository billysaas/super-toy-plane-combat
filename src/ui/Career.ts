import type { MatchResult } from "../game/LocalMatch";

export interface CareerState {
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  medals: number;
  bestStreak: number;
  bestSurvivalWave: number;
}

export interface RankInfo {
  name: string;
  index: number;
  xpInto: number;
  xpForNext: number;
  progress: number;
  nextName: string | null;
}

const STORAGE_KEY = "stpc-career";

const RANKS: Array<{ xp: number; name: string }> = [
  { xp: 0, name: "ROOKIE" },
  { xp: 250, name: "CADET" },
  { xp: 700, name: "PILOT" },
  { xp: 1500, name: "FLIGHT LEAD" },
  { xp: 3000, name: "ACE" },
  { xp: 5200, name: "LEGEND" },
  { xp: 8000, name: "TOY ACE" },
];

function freshCareer(): CareerState {
  return { xp: 0, matches: 0, wins: 0, kills: 0, deaths: 0, medals: 0, bestStreak: 0, bestSurvivalWave: 0 };
}

export function rankInfo(xp: number): RankInfo {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xp) index = i;
  }
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const xpInto = xp - current.xp;
  const xpForNext = next ? next.xp - current.xp : 0;
  return {
    name: current.name,
    index,
    xpInto,
    xpForNext,
    progress: next ? Math.min(1, xpInto / xpForNext) : 1,
    nextName: next?.name ?? null,
  };
}

export function resultXp(result: MatchResult): number {
  let xp = 15 + result.playerKills * 12;
  xp += (result.medals?.length ?? 0) * 25;
  if (result.survival) {
    xp += result.survival.wave * 30 + Math.floor(result.survival.time / 30) * 8;
  } else if (result.win) {
    xp += 60;
  } else if (result.draw) {
    xp += 20;
  }
  if (result.stats) {
    xp += Math.floor(result.stats.damageDealt / 40);
    xp += result.stats.balloonsPopped * 5;
    xp += result.stats.bestStreak * 4;
  }
  return Math.max(10, Math.round(xp));
}

export class CareerStore {
  state: CareerState = freshCareer();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CareerState>;
      this.state = {
        ...freshCareer(),
        ...parsed,
        xp: Math.max(0, Number(parsed.xp) || 0),
        matches: Math.max(0, Number(parsed.matches) || 0),
      };
    } catch {
      this.state = freshCareer();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      return;
    }
  }

  applyResult(result: MatchResult): { gained: number; before: RankInfo; after: RankInfo } {
    const gained = resultXp(result);
    const before = rankInfo(this.state.xp);
    this.state.xp += gained;
    this.state.matches++;
    this.state.kills += result.playerKills;
    this.state.deaths += result.playerDeaths;
    this.state.medals += result.medals?.length ?? 0;
    if (result.win) this.state.wins++;
    if (result.stats) this.state.bestStreak = Math.max(this.state.bestStreak, result.stats.bestStreak);
    if (result.survival) this.state.bestSurvivalWave = Math.max(this.state.bestSurvivalWave, result.survival.wave);
    this.save();
    return { gained, before, after: rankInfo(this.state.xp) };
  }
}
