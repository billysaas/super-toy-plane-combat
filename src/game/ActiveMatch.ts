import type { CameraMode, GameMode } from "../../shared/config";
import type { HudData, MatchResult, ScoreRow } from "./LocalMatch";

export interface ActiveMatch {
  update(dt: number): void;
  getHud(): HudData;
  getScoreboard(): ScoreRow[];
  getMode(): GameMode;
  toggleCamera(): CameraMode;
  getCameraMode(): CameraMode;
  setPaused(paused: boolean): void;
  dispose(): void;
  sendChat(text: string): void;
  getResult(): MatchResult | null;
}
