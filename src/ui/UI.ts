import {
  AIRCRAFT,
  DEFAULT_SETTINGS,
  DEFAULT_SOLO,
  formatTime,
  getAircraft,
  type AircraftDef,
  type Difficulty,
  type GameMode,
  type Settings,
  type SoloConfig,
  type Team,
} from "../../shared/config";
import type { HudData, MatchResult, ScoreRow } from "../game/LocalMatch";
import type { CalloutTone } from "../../shared/streaks";
import type { KillEvent } from "../../shared/types";

export type ScreenName = "menu" | "solo" | "hangar" | "settings" | "tutorial" | "multiplayer" | "lobby" | "pause";

export interface RoomSummary {
  roomId: string;
  clients: number;
  maxClients: number;
  mode: GameMode;
  isPrivate: boolean;
  code: string;
}

export interface LobbyPlayerView {
  id: string;
  name: string;
  team: Team;
  aircraft: string;
  ready: boolean;
  isHost: boolean;
  isMe: boolean;
}

export interface LobbyStateView {
  code: string;
  mode: GameMode;
  maxPlayers: number;
  players: LobbyPlayerView[];
  phase: string;
  meId: string;
  hostId: string;
}

export interface CreateRoomOptions {
  name: string;
  mode: GameMode;
  maxPlayers: number;
  isPrivate: boolean;
}

export interface UIActions {
  onStartSolo: (config: SoloConfig) => void;
  onRefreshRooms: () => void;
  onQuickMatch: (name: string) => void;
  onCreateRoom: (options: CreateRoomOptions) => void;
  onJoinRoom: (roomId: string) => void;
  onJoinCode: (code: string, name: string) => void;
  onLeaveLobby: () => void;
  onToggleReady: (ready: boolean) => void;
  onSetTeam: (team: Team) => void;
  onSetAircraft: (aircraftId: string) => void;
  onHostStart: () => void;
  onSaveSettings: (settings: Settings) => void;
  onResume: () => void;
  onPause: () => void;
  onAbandon: () => void;
  onRematch: () => void;
  onReturnMenu: () => void;
  onChatSend: (text: string) => void;
  onLobbyChatSend: (text: string) => void;
  onOpenChat: () => void;
  onToggleMusic: () => void;
  onScreenChange: (screen: ScreenName) => void;
  onTouchVisible?: (visible: boolean) => void;
}

const PLANE_PATH = "M60 5 L67 42 L67 55 L112 68 L112 78 L67 70 L65 96 L84 107 L84 113 L60 104 L36 113 L36 107 L55 96 L53 70 L8 78 L8 68 L53 55 L53 42 Z";

function planeSvg(): string {
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><path fill="currentColor" d="${PLANE_PATH}" /></svg>`;
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing DOM node #${id}`);
  return node as T;
}

function option(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));
}

export class UIManager {
  actions?: UIActions;
  settings: Settings = { ...DEFAULT_SETTINGS };
  aircraftId: string = DEFAULT_SOLO.aircraftId;
  currentScreen: ScreenName = "menu";
  private soloMode: GameMode = "tdm";
  private soloDifficulty: Difficulty = "pilot";
  private soloEnemies = 5;
  private lobby?: LobbyStateView;
  private settingsFromPause = false;
  private chatOpen = false;
  private lastKills = 0;
  private radarTick = 0;
  private lastHit = 0;
  private toastTimer = 0;
  private calloutTimer = 0;
  private chatTimers: number[] = [];
  private killTimers: number[] = [];
  private isTouch = false;
  private radarCtx: CanvasRenderingContext2D | null;

  constructor() {
    this.loadLocal();
    this.radarCtx = (el<HTMLCanvasElement>("radar")).getContext("2d");
    this.buildAircraftCards();
    this.buildPickers();
    this.bindMenus();
    this.bindLobby();
    this.bindHud();
    el("btn-music").addEventListener("click", () => this.actions?.onToggleMusic());
    this.setMusicEnabled(true);
    this.syncSettingsControls();
    this.syncNames();
    this.updateHangarPreview();
    this.updateSoloPreview();
    el("mp-name").addEventListener("input", () => {
      this.settings.playerName = (el<HTMLInputElement>("mp-name").value.trim().slice(0, 16) || "TopGun");
      this.saveLocal();
      el<HTMLInputElement>("set-name").value = this.settings.playerName;
    });
  }

  setActions(actions: UIActions): void {
    this.actions = actions;
  }

  getPlayerName(): string {
    return this.settings.playerName.trim() || "TopGun";
  }

  private loadLocal(): void {
    try {
      const touch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
      const raw = localStorage.getItem("stpc-settings");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else if (touch) {
        this.settings = { ...DEFAULT_SETTINGS, quality: "low" };
      }
      const aircraft = localStorage.getItem("stpc-aircraft");
      if (aircraft && AIRCRAFT.some((a) => a.id === aircraft)) this.aircraftId = aircraft;
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private saveLocal(): void {
    try {
      localStorage.setItem("stpc-settings", JSON.stringify(this.settings));
      localStorage.setItem("stpc-aircraft", this.aircraftId);
    } catch {
      return;
    }
  }

  setTouchMode(isTouch: boolean): void {
    this.isTouch = isTouch;
    document.body.classList.toggle("touch-device", isTouch);
  }

  hideLoading(): void {
    const loading = document.getElementById("loading-screen");
    if (loading) loading.classList.add("done");
  }

  setLoading(progress: number, label: string): void {
    const fill = document.getElementById("loading-fill");
    const labelEl = document.getElementById("loading-label");
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
    if (labelEl) labelEl.textContent = label.toUpperCase();
  }

  showLoadingContinue(): void {
    const prompt = el("loading-prompt");
    prompt.textContent = this.isTouch ? "TOUCH THE SCREEN TO CONTINUE" : "PRESS ANY KEY TO CONTINUE";
    prompt.classList.remove("hidden");
  }

  setMusicEnabled(enabled: boolean): void {
    const button = el("btn-music");
    button.classList.toggle("muted", !enabled);
    button.setAttribute("aria-pressed", String(!enabled));
    button.setAttribute("aria-label", enabled ? "Mute music" : "Play music");
    button.title = enabled ? "Mute music" : "Play music";
  }

  setMusicToggleVisible(visible: boolean): void {
    el("btn-music").classList.toggle("hidden", !visible);
  }

  showScreen(screen: ScreenName, notify = true): void {
    this.currentScreen = screen;
    document.querySelectorAll<HTMLElement>(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.getElementById(`${screen}-screen`);
    if (target) target.classList.add("active");
    this.setMusicToggleVisible(true);
    if (screen !== "settings") this.settingsFromPause = false;
    if (notify) this.actions?.onScreenChange(screen);
  }

  showMenu(): void {
    this.hideHud();
    el("pause-screen").classList.add("hidden");
    el("results-screen").classList.add("hidden");
    el("scoreboard-overlay").classList.add("hidden");
    this.showScreen("menu");
  }

  enterGame(): void {
    document.querySelectorAll<HTMLElement>(".screen").forEach((s) => s.classList.remove("active"));
    el("pause-screen").classList.add("hidden");
    el("results-screen").classList.add("hidden");
    el("scoreboard-overlay").classList.add("hidden");
    this.hideLeaveConfirm();
    this.setMusicToggleVisible(false);
    el("hud").classList.remove("hidden");
    el("combat-callout").classList.add("hidden");
    this.clearFeeds();
    this.lastKills = 0;
    this.showToast("MISSION START · GOOD HUNTING", 2.6);
    if (this.isTouch) {
      el("touch-ui").classList.remove("hidden");
      this.actions?.onTouchVisible?.(true);
    }
  }

  hideHud(): void {
    this.closeChat();
    this.hideLeaveConfirm();
    el("hud").classList.add("hidden");
    el("touch-ui").classList.add("hidden");
    this.actions?.onTouchVisible?.(false);
    this.setLockPrompt(false);
  }

  showPause(): void {
    this.hideLeaveConfirm();
    this.setMusicToggleVisible(false);
    el("pause-screen").classList.remove("hidden");
  }

  hidePause(): void {
    el("pause-screen").classList.add("hidden");
    this.hideLeaveConfirm();
  }

  showLeaveConfirm(): void {
    el("leave-confirm").classList.remove("hidden");
  }

  hideLeaveConfirm(): void {
    el("leave-confirm").classList.add("hidden");
  }

  isLeaveConfirmOpen(): boolean {
    return !el("leave-confirm").classList.contains("hidden");
  }

  dismissLeaveConfirm(): boolean {
    if (!this.isLeaveConfirmOpen()) return false;
    this.hideLeaveConfirm();
    return true;
  }

  showScoreboard(rows: ScoreRow[], mode: GameMode): void {
    el("scoreboard-table").innerHTML = this.scoreTableHtml(rows, mode);
    el("scoreboard-overlay").classList.remove("hidden");
  }

  hideScoreboard(): void {
    el("scoreboard-overlay").classList.add("hidden");
  }

  showResults(result: MatchResult): void {
    this.closeChat();
    this.setMusicToggleVisible(false);
    const overlay = el("results-screen");
    overlay.classList.remove("hidden");
    el("results-kicker").textContent = result.draw ? "MISSION ENDED" : result.win ? "MISSION COMPLETE" : "MISSION FAILED";
    el("results-title").textContent = result.draw ? "DRAW" : result.win ? "VICTORY" : "DEFEAT";
    el("results-title").style.color = result.draw ? "var(--yellow)" : result.win ? "var(--cream)" : "#ff917d";
    const scoreline = el("results-scoreline");
    if (result.mode === "tdm") {
      scoreline.innerHTML = `<span class="blue">RAF ${result.scoreRAF}</span><span class="dash">—</span><span class="red">${result.scoreAXIS} AXIS</span>`;
    } else {
      scoreline.innerHTML = `<span class="blue">${result.playerKills} KILLS</span><span class="dash">·</span><span class="red">${result.playerDeaths} LOSSES</span>`;
    }
    el("results-stats").innerHTML = `<span>KILLS <b>${result.playerKills}</b></span><span>LOSSES <b>${result.playerDeaths}</b></span><span>BANDITS <b>${Math.max(0, result.rows.length - 1)}</b></span>`;
    el("results-table").innerHTML = this.scoreTableHtml(result.rows, result.mode);
    this.hideHud();
  }

  hideResults(): void {
    el("results-screen").classList.add("hidden");
  }

  showLobby(state: LobbyStateView): void {
    this.lobby = state;
    if (this.currentScreen !== "lobby") this.showScreen("lobby", false);
    el("lobby-code").textContent = state.code;
    el("lobby-title").textContent = state.mode === "ffa" ? "FREE-FOR-ALL LOBBY" : "TEAM DEATHMATCH LOBBY";
    el("lobby-mode-label").textContent = state.mode === "ffa" ? "FREE FOR ALL" : "TEAM DEATHMATCH";
    const me = state.players.find((p) => p.id === state.meId);
    this.renderLobbyTeam("raf", state.players.filter((p) => p.team === "RAF"));
    this.renderLobbyTeam("axis", state.players.filter((p) => p.team === "AXIS"));
    el("lobby-raf-count").textContent = String(state.players.filter((p) => p.team === "RAF").length);
    el("lobby-axis-count").textContent = String(state.players.filter((p) => p.team === "AXIS").length);
    const readyBtn = el<HTMLButtonElement>("btn-ready");
    readyBtn.textContent = me?.ready ? "READY · STANDBY" : "READY UP";
    readyBtn.classList.toggle("btn-primary", !me?.ready);
    const hostStart = el<HTMLButtonElement>("btn-host-start");
    hostStart.classList.toggle("visible", state.meId === state.hostId);
    hostStart.disabled = state.players.length < 1;
    el("lobby-status").textContent = state.phase === "lobby" ? `${state.players.length}/${state.maxPlayers} PILOTS · WAITING FOR READY CHECKS` : "MATCH IN PROGRESS";
    const myAircraft = me?.aircraft ?? this.aircraftId;
    el("lobby-aircraft-name").textContent = getAircraft(myAircraft).name.toUpperCase();
    document.querySelectorAll<HTMLButtonElement>("#lobby-aircraft-picker button").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.aircraft === myAircraft);
    });
    el("btn-team-raf").textContent = "JOIN RAF";
    el("btn-team-axis").textContent = "JOIN AXIS";
  }

  setLobbyStatus(text: string): void {
    el("lobby-status").textContent = text;
  }

  addLobbyChat(name: string, text: string, team: Team | "SYSTEM"): void {
    const box = el("lobby-chat");
    const line = document.createElement("div");
    line.className = team === "SYSTEM" ? "chat-system" : team === "RAF" ? "chat-raf" : "chat-axis";
    line.textContent = `${team === "SYSTEM" ? "CONTROL" : name}: ${text}`;
    box.appendChild(line);
    while (box.children.length > 40) box.removeChild(box.firstChild!);
    box.scrollTop = box.scrollHeight;
  }

  clearLobbyChat(): void {
    el("lobby-chat").innerHTML = "";
  }

  private renderLobbyTeam(side: "raf" | "axis", players: LobbyPlayerView[]): void {
    const list = el(`lobby-${side}-list`);
    list.innerHTML = "";
    if (players.length === 0) {
      const empty = document.createElement("div");
      empty.className = "player-list-empty";
      empty.textContent = "NO PILOTS ASSIGNED";
      list.appendChild(empty);
      return;
    }
    for (const p of players) {
      const row = document.createElement("div");
      row.className = `lobby-player${p.isMe ? " me" : ""}${p.ready ? " ready" : ""}`;
      const star = document.createElement("span");
      star.className = "host-star";
      star.textContent = p.isHost ? "★" : getAircraft(p.aircraft).callsign;
      const name = document.createElement("span");
      name.textContent = p.name;
      const ready = document.createElement("span");
      ready.className = "ready-pip";
      ready.title = p.ready ? "READY" : "NOT READY";
      row.append(star, name, ready);
      list.appendChild(row);
    }
  }

  setServerStatus(status: "connecting" | "online" | "offline", text: string): void {
    el("server-status").textContent = text.toUpperCase();
    el("server-dot").classList.toggle("online", status === "online");
  }

  setMpError(message: string): void {
    el("mp-error").textContent = message;
  }

  setRoomList(rooms: RoomSummary[]): void {
    const list = el("room-list");
    el("room-count").textContent = String(rooms.length);
    list.innerHTML = "";
    if (!rooms.length) {
      const empty = document.createElement("div");
      empty.className = "empty-rooms";
      empty.innerHTML = "NO ROOMS IN THE AIR.<br />START A SORTIE OR QUICK MATCH.";
      list.appendChild(empty);
      return;
    }
    for (const room of rooms) {
      const row = document.createElement("div");
      row.className = "room-row";
      const badge = document.createElement("div");
      badge.className = "room-badge";
      badge.textContent = room.mode === "tdm" ? "TDM" : "FFA";
      const main = document.createElement("div");
      main.className = "room-main";
      const title = document.createElement("b");
      title.textContent = `${room.code} · ${room.mode === "tdm" ? "TEAM DEATHMATCH" : "FREE FOR ALL"}`;
      const meta = document.createElement("span");
      meta.textContent = `${room.clients}/${room.maxClients} pilots · ${room.isPrivate ? "private" : "public"}`;
      main.append(title, meta);
      const join = document.createElement("button");
      join.className = "room-join";
      join.textContent = "JOIN";
      join.addEventListener("click", () => this.actions?.onJoinRoom(room.roomId));
      row.append(badge, main, join);
      list.appendChild(row);
    }
  }

  setMpConnecting(connecting: boolean, message = ""): void {
    const quick = el<HTMLButtonElement>("btn-quick-match");
    const create = el<HTMLButtonElement>("btn-create-room");
    quick.disabled = connecting;
    create.disabled = connecting;
    if (connecting) this.setMpError(message || "CONNECTING TO THE TOY BOX...");
  }

  setLockPrompt(visible: boolean): void {
    el("lock-prompt").classList.toggle("hidden", !visible || this.isTouch || this.chatOpen);
  }

  showToast(text: string, seconds = 2.2): void {
    const toast = el("toast");
    toast.textContent = text;
    toast.classList.remove("hidden");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.add("hidden"), seconds * 1000);
  }

  showCombatCallout(title: string, subtitle: string, tone: CalloutTone): void {
    const node = el("combat-callout");
    el("combat-callout-title").textContent = title;
    el("combat-callout-sub").textContent = subtitle;
    node.className = `combat-callout ${tone}`;
    void node.offsetWidth;
    window.clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => node.classList.add("hidden"), 2500);
  }

  addChat(name: string, text: string, team: Team | "SYSTEM"): void {
    const feed = el("chat-feed");
    const line = document.createElement("div");
    line.className = `chat-line${team === "SYSTEM" ? " system" : team === "AXIS" ? " axis" : ""}`;
    const author = document.createElement("span");
    author.className = "chat-author";
    author.textContent = `${team === "SYSTEM" ? "CONTROL" : name}: `;
    const msg = document.createElement("span");
    msg.textContent = text;
    line.append(author, msg);
    feed.appendChild(line);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild!);
    const timer = window.setTimeout(() => line.remove(), team === "SYSTEM" ? 9000 : 12000);
    this.chatTimers.push(timer);
    if (team === "SYSTEM" && this.currentScreen === "lobby") this.addLobbyChat(name, text, "SYSTEM");
  }

  addKill(event: KillEvent): void {
    const feed = el("feed-panel");
    const item = document.createElement("div");
    item.className = "feed-item";
    const killer = document.createElement("span");
    killer.className = event.killerTeam === "RAF" ? "f-blue" : "f-red";
    killer.textContent = event.killer;
    const arrow = document.createElement("span");
    arrow.className = "f-weapon";
    arrow.textContent = "  →  ";
    const victim = document.createElement("span");
    victim.className = event.victimTeam === "RAF" ? "f-blue" : "f-red";
    victim.textContent = event.victim;
    item.append(killer, arrow, victim);
    feed.appendChild(item);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild!);
    const timer = window.setTimeout(() => item.remove(), 8000);
    this.killTimers.push(timer);
  }

  clearFeeds(): void {
    el("feed-panel").innerHTML = "";
    el("chat-feed").innerHTML = "";
    this.chatTimers.forEach((t) => clearTimeout(t));
    this.killTimers.forEach((t) => clearTimeout(t));
    this.chatTimers = [];
    this.killTimers = [];
  }

  updateHud(data: HudData): void {
    const hud = el("hud");
    hud.classList.remove("hidden");
    const scoreRaf = el("score-raf");
    const scoreAxis = el("score-axis");
    const blueBlock = document.querySelector<HTMLElement>(".score-block.blue");
    const redBlock = document.querySelector<HTMLElement>(".score-block.red");
    if (data.mode === "ffa") {
      el("match-mode-label").textContent = "FREE FOR ALL";
      if (blueBlock) blueBlock.firstElementChild!.textContent = "KILLS";
      if (redBlock) redBlock.lastElementChild!.textContent = "LOSSES";
      scoreRaf.textContent = String(data.kills);
      scoreAxis.textContent = String(data.deaths);
      el("hud-mode").textContent = "FREE-FOR-ALL DOGFIGHT";
    } else {
      el("match-mode-label").textContent = "TEAM DEATHMATCH";
      if (blueBlock) blueBlock.firstElementChild!.textContent = "RAF";
      if (redBlock) redBlock.lastElementChild!.textContent = "AXIS";
      scoreRaf.textContent = String(data.scoreRAF);
      scoreAxis.textContent = String(data.scoreAXIS);
      el("hud-mode").textContent = "TEAM DOGFIGHT";
    }
    el("match-timer").textContent = formatTime(data.timeLeft);
    el("hud-player-name").textContent = data.playerName.toUpperCase();
    el("hud-aircraft-name").textContent = data.aircraftName.toUpperCase();
    const healthRatio = data.maxHealth > 0 ? data.health / data.maxHealth : 0;
    const healthFill = el("health-fill");
    healthFill.style.width = `${Math.max(0, Math.min(1, healthRatio)) * 100}%`;
    healthFill.style.background = healthRatio < 0.3 ? "linear-gradient(90deg,#d94a36,#ff826a)" : "linear-gradient(90deg,#53c16d,#89e99f)";
    el("health-value").textContent = String(Math.max(0, Math.ceil(data.health)));
    const armorRatio = data.armorMax > 0 ? data.armor / data.armorMax : 0;
    el("armor-fill").style.width = `${Math.max(0, Math.min(1, armorRatio)) * 100}%`;
    el("armor-value").textContent = String(Math.max(0, Math.ceil(data.armor)));
    el("cadence-value").textContent = data.cadence > 0 ? `${Math.ceil(data.cadence)}S` : "--";
    el("cadence-row").classList.toggle("active", data.cadence > 0);
    el("shield-value").textContent = data.shield > 0 ? `${Math.ceil(data.shield)} · ${Math.ceil(data.shieldSeconds)}S` : "--";
    el("shield-row").classList.toggle("active", data.shield > 0);
    el("streak-value").textContent = String(data.streak);
    el("streak-row").classList.toggle("active", data.streak >= 2);
    el("streak-row").classList.toggle("hot", data.streak >= 5);
    el("boost-fill").style.width = `${Math.max(0, Math.min(100, data.boost))}%`;
    el("boost-value").textContent = String(Math.round(data.boost));
    el("throttle-fill").style.width = `${Math.max(0, Math.min(100, data.throttle * 100))}%`;
    el("throttle-value").textContent = String(Math.round(data.throttle * 100));
    el("ammo-value").textContent = String(data.ammo);
    el("rocket-value").textContent = `×${data.rockets}`;
    el("flare-value").textContent = `×${data.flares}`;
    el("flare-row").classList.toggle("active", data.flares > 0);
    el("speed-value").textContent = String(Math.max(0, Math.round(data.speed)));
    el("alt-value").textContent = String(Math.max(0, Math.round(data.altitude)));
    const speedAngle = -120 + Math.max(0, Math.min(1, data.speed / 320)) * 240;
    const altAngle = -120 + Math.max(0, Math.min(1, data.altitude / 300)) * 240;
    el("speed-needle").style.transform = `translate(-50%, -100%) rotate(${speedAngle}deg)`;
    el("alt-needle").style.transform = `translate(-50%, -100%) rotate(${altAngle}deg)`;
    el("camera-label").textContent = data.cameraMode === "chase" ? "CHASE CAM" : "COCKPIT CAM";
    hud.classList.toggle("cockpit-mode", data.cameraMode === "cockpit");
    el("score-kd").textContent = `${data.kills} / ${data.deaths}`;
    el("low-health").classList.toggle("active", data.alive && healthRatio < 0.3);
    el("damage-vignette").style.opacity = String(Math.min(0.92, data.damageFlash));
    const condition = data.maxHealth > 0 ? data.health / data.maxHealth : 0;
    let warning = "";
    if (data.alive) {
      if (data.missileWarning) warning = "MISSILE LOCK · F FLARES · BREAK TURN";
      else if (condition < 0.22) warning = "HULL CRITICAL · BREAK OFF";
      else if (data.stalled) warning = "STALL · NOSE DOWN · FULL THROTTLE";
      else if (condition < 0.5) warning = "AIRFRAME DAMAGED · HANDLING REDUCED";
    }
    const warningNode = el("hud-warning");
    warningNode.classList.toggle("hidden", !warning);
    warningNode.classList.toggle("danger", data.missileWarning || condition < 0.22 || data.stalled);
    if (warning) el("hud-warning-text").textContent = warning;
    const crosshair = el("crosshair");
    crosshair.classList.toggle("hidden", !data.alive);
    const bracket = el("target-bracket");
    if (data.target && data.target.onScreen && data.alive) {
      bracket.classList.remove("hidden");
      bracket.style.left = `${Math.max(4, Math.min(96, data.target.x))}%`;
      bracket.style.top = `${Math.max(8, Math.min(92, data.target.y))}%`;
      el("target-distance").textContent = `${Math.round(data.target.distance)}M`;
      el("target-health-fill").style.width = `${Math.max(0, Math.min(1, data.target.health)) * 100}%`;
      bracket.style.opacity = "1";
    } else {
      bracket.classList.add("hidden");
    }
    if (data.hitFlash > 0.72 && this.lastHit <= 0.72) {
      const marker = el("hitmarker");
      marker.classList.remove("show");
      void marker.offsetWidth;
      marker.classList.add("show");
    }
    this.lastHit = data.hitFlash;
    if (data.kills > this.lastKills) {
      this.lastKills = data.kills;
      const kill = el("kill-marker");
      kill.classList.remove("show");
      void kill.offsetWidth;
      kill.classList.add("show");
    }
    const respawn = el("respawn-overlay");
    respawn.classList.toggle("hidden", data.alive);
    if (!data.alive) el("respawn-count").textContent = String(Math.ceil(data.respawnIn));
    el("spectate-hint").classList.toggle("hidden", data.alive);
    this.radarTick++;
    if (this.radarTick % 3 === 0) this.drawRadar(data);
    el("radar-player").style.transform = `translate(-50%, -50%) rotate(${-data.playerHeading}deg)`;
    this.updateTouchThrottle(data);
  }

  private updateTouchThrottle(data: HudData): void {
    if (!this.isTouch) return;
    const label = document.getElementById("touch-throttle-label");
    if (label) label.textContent = String(Math.round(data.throttle * 100));
    const slider = document.getElementById("touch-throttle") as HTMLInputElement | null;
    if (slider && document.activeElement !== slider) slider.value = String(Math.round(data.throttle * 100));
  }

  private drawRadar(data: HudData): void {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const size = 200;
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, 94, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createRadialGradient(c, c, 0, c, c, 94);
    grad.addColorStop(0, "rgba(16,34,56,.8)");
    grad.addColorStop(1, "rgba(5,11,20,.96)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(246,234,209,.16)";
    ctx.lineWidth = 1;
    for (const r of [31, 62, 92]) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, size);
    ctx.moveTo(0, c);
    ctx.lineTo(size, c);
    ctx.stroke();
    ctx.strokeStyle = "rgba(248,200,64,.16)";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(c, c, 94, -Math.PI * 0.7, -Math.PI * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
    const range = 115;
    for (const blip of data.radar) {
      const px = c + (blip.x / range) * 88;
      const py = c + (blip.y / range) * 88;
      if (Math.hypot(px - c, py - c) > 92) continue;
      ctx.fillStyle = blip.team === "RAF" ? "#67b7ff" : "#ff735e";
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.3, -2.3, 4.6, 4.6);
      ctx.restore();
      if (blip.isTarget) {
        ctx.strokeStyle = "#f8c840";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(248,200,64,.8)";
    ctx.fillRect(c - 1, c - 1, 2, 2);
    ctx.restore();
  }

  openChat(onSend: (text: string) => void, onCancel: () => void): void {
    if (this.chatOpen) return;
    this.chatOpen = true;
    const bar = el("chat-bar");
    const input = el<HTMLInputElement>("chat-input");
    bar.classList.remove("hidden");
    this.setLockPrompt(false);
    input.value = "";
    window.setTimeout(() => input.focus(), 20);
    const close = () => {
      bar.classList.add("hidden");
      this.chatOpen = false;
      input.onkeydown = null;
      input.blur();
      onCancel();
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        const text = input.value.trim();
        if (text) onSend(text);
        close();
        event.preventDefault();
      } else if (event.key === "Escape") {
        close();
        event.preventDefault();
        event.stopPropagation();
      }
    };
  }

  get isChatOpen(): boolean {
    return this.chatOpen;
  }

  closeChat(): void {
    if (!this.chatOpen) return;
    el("chat-bar").classList.add("hidden");
    this.chatOpen = false;
  }

  private buildAircraftCards(): void {
    const grid = el("hangar-cards");
    grid.innerHTML = AIRCRAFT.map((a) => this.aircraftCardHtml(a)).join("");
    grid.addEventListener("click", (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-aircraft]");
      if (!card) return;
      this.selectAircraft(card.dataset.aircraft!);
    });
    el("btn-select-aircraft").addEventListener("click", () => {
      this.actions?.onSetAircraft(this.aircraftId);
      this.showScreen("solo");
    });
  }

  private aircraftCardHtml(a: AircraftDef): string {
    const color = hex(a.bodyColor);
    const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    return `<button class="aircraft-card" data-aircraft="${a.id}" style="--plane-color:${color}">
      <div class="card-tag">${a.callsign} · ${a.id === "meadowhawk" ? "RAF" : a.id === "crimsonfox" ? "AXIS" : "NEUTRAL"}</div>
      <div class="plane-art">${planeSvg()}</div>
      <h3>${a.name.toUpperCase()}</h3>
      <p>${a.blurb}</p>
      <div class="card-stats">
        <div class="stat"><span>SPD</span><div class="pips">${pips(a.stats.speed)}</div></div>
        <div class="stat"><span>AGI</span><div class="pips">${pips(a.stats.agility)}</div></div>
        <div class="stat"><span>ARM</span><div class="pips">${pips(a.stats.armor)}</div></div>
      </div>
      <div class="card-check">SELECTED ✓</div>
    </button>`;
  }

  private buildPickers(): void {
    const picker = el("solo-aircraft-picker");
    picker.innerHTML = AIRCRAFT.map((a) => `<button data-aircraft="${a.id}" style="--pick-color:${hex(a.bodyColor)}" title="${a.name}">${planeSvg()}</button>`).join("");
    picker.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLElement>("[data-aircraft]");
      if (!btn) return;
      this.selectAircraft(btn.dataset.aircraft!);
    });
    const lobbyPicker = el("lobby-aircraft-picker");
    lobbyPicker.innerHTML = AIRCRAFT.map((a) => `<button data-aircraft="${a.id}" style="--pick-color:${hex(a.bodyColor)}" title="${a.name}">${planeSvg()}</button>`).join("");
    lobbyPicker.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLElement>("[data-aircraft]");
      if (!btn) return;
      this.aircraftId = btn.dataset.aircraft!;
      document.querySelectorAll<HTMLButtonElement>("#lobby-aircraft-picker button").forEach((b) => b.classList.toggle("selected", b.dataset.aircraft === this.aircraftId));
      this.actions?.onSetAircraft(this.aircraftId);
    });
  }

  private selectAircraft(id: string): void {
    if (!AIRCRAFT.some((a) => a.id === id)) return;
    this.aircraftId = id;
    this.actions?.onSetAircraft(id);
    this.saveLocal();
    this.updateHangarPreview();
    this.updateSoloPreview();
    document.querySelectorAll<HTMLButtonElement>("#lobby-aircraft-picker button").forEach((b) => b.classList.toggle("selected", b.dataset.aircraft === id));
  }

  updateSoloPreview(): void {
    const def = getAircraft(this.aircraftId);
    const preview = el("solo-aircraft-preview");
    preview.innerHTML = `<div class="solo-preview-art" style="color:${hex(def.bodyColor)}">${planeSvg()}</div><div class="solo-preview-name" style="color:${hex(def.accentColor)}">${def.name.toUpperCase()}</div><div class="solo-preview-meta">${def.callsign} · TOY WARBIRD</div>`;
    document.querySelectorAll<HTMLButtonElement>("#solo-aircraft-picker button").forEach((btn) => btn.classList.toggle("selected", btn.dataset.aircraft === this.aircraftId));
  }

  private updateHangarPreview(): void {
    const def = getAircraft(this.aircraftId);
    const detail = el("hangar-preview");
    detail.style.setProperty("--preview-color", hex(def.bodyColor));
    detail.innerHTML = planeSvg();
    const stats = (label: string, value: number) => `<div class="stat-line"><span class="stat-name">${label}</span><span class="stat-value">${"■".repeat(value)}${"□".repeat(5 - value)}</span></div>`;
    el("hangar-stats").innerHTML = `
      <div class="stat-line"><span class="stat-name">AIRFRAME</span><span class="stat-value">${def.callsign}</span></div>
      ${stats("TOP SPEED", def.stats.speed)}
      ${stats("AGILITY", def.stats.agility)}
      ${stats("ARMOUR", def.stats.armor)}
      <div class="stat-line"><span class="stat-name">HULL</span><span class="stat-value">${def.maxHealth}</span></div>
      <div class="stat-line"><span class="stat-name">GUNS / RKT / FLR</span><span class="stat-value">${def.gunAmmo} / ${def.rocketAmmo} / ${def.flareAmmo}</span></div>
      <p class="stat-desc">${def.blurb}</p>`;
    document.querySelectorAll<HTMLElement>("[data-aircraft]").forEach((card) => {
      if (card.classList.contains("aircraft-card")) card.classList.toggle("selected", card.dataset.aircraft === this.aircraftId);
    });
  }

  private bindMenus(): void {
    el("btn-solo").addEventListener("click", () => {
      this.updateSoloPreview();
      this.showScreen("solo");
    });
    el("btn-multiplayer").addEventListener("click", () => {
      this.showScreen("multiplayer");
      this.actions?.onRefreshRooms();
    });
    el("btn-hangar").addEventListener("click", () => {
      this.updateHangarPreview();
      this.showScreen("hangar");
    });
    el("btn-settings").addEventListener("click", () => {
      this.settingsFromPause = false;
      this.openSettings();
    });
    el("btn-tutorial").addEventListener("click", () => this.showScreen("tutorial"));
    document.querySelectorAll<HTMLElement>(".screen .back-button").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.currentScreen === "settings" && this.settingsFromPause) {
          this.returnFromPauseSettings();
          return;
        }
        this.showMenu();
      });
    });
    el("solo-mode").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
      if (!btn) return;
      this.soloMode = btn.dataset.mode as GameMode;
      document.querySelectorAll<HTMLButtonElement>("#solo-mode button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    el("difficulty-grid").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-difficulty]");
      if (!btn) return;
      this.soloDifficulty = btn.dataset.difficulty as Difficulty;
      document.querySelectorAll<HTMLButtonElement>("#difficulty-grid button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    const enemyRange = el<HTMLInputElement>("enemy-count");
    enemyRange.addEventListener("input", () => {
      this.soloEnemies = Number(enemyRange.value);
      el("enemy-count-label").textContent = `${this.soloEnemies} BANDIT${this.soloEnemies === 1 ? "" : "S"}`;
    });
    el("solo-change-aircraft").addEventListener("click", () => {
      this.updateHangarPreview();
      this.showScreen("hangar");
    });
    el("btn-start-solo").addEventListener("click", () => {
      this.actions?.onSetAircraft(this.aircraftId);
      this.actions?.onStartSolo({
        mode: this.soloMode,
        enemies: this.soloEnemies,
        difficulty: this.soloDifficulty,
        aircraftId: this.aircraftId,
      });
    });
    this.bindSettings();
    this.bindMultiplayer();
  }

  private openSettings(): void {
    this.syncSettingsControls();
    this.showScreen("settings");
    el("pause-screen").classList.add("hidden");
  }

  private returnFromPauseSettings(): void {
    document.querySelectorAll<HTMLElement>(".screen").forEach((s) => s.classList.remove("active"));
    this.currentScreen = "pause";
    this.setMusicToggleVisible(false);
    el("pause-screen").classList.remove("hidden");
    this.settingsFromPause = false;
  }

  private syncSettingsControls(): void {
    document.querySelectorAll<HTMLButtonElement>("#quality-select button").forEach((b) => b.classList.toggle("selected", b.dataset.quality === this.settings.quality));
    const volume = el<HTMLInputElement>("set-volume");
    volume.value = String(Math.round(this.settings.masterVolume * 100));
    el("volume-label").textContent = `${volume.value}%`;
    const sens = el<HTMLInputElement>("set-sensitivity");
    sens.value = String(Math.round(this.settings.sensitivity * 100));
    el("sensitivity-label").textContent = this.settings.sensitivity.toFixed(1);
    el<HTMLInputElement>("set-invert").checked = this.settings.invertY;
    el<HTMLInputElement>("set-tracers").checked = this.settings.showTracers;
    el<HTMLInputElement>("set-name").value = this.settings.playerName;
    document.querySelectorAll<HTMLButtonElement>("#camera-select button").forEach((b) => b.classList.toggle("selected", b.dataset.camera === this.settings.camera));
  }

  private bindSettings(): void {
    el("quality-select").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-quality]");
      if (!btn) return;
      document.querySelectorAll<HTMLButtonElement>("#quality-select button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    el<HTMLInputElement>("set-volume").addEventListener("input", (event) => {
      el("volume-label").textContent = `${(event.target as HTMLInputElement).value}%`;
    });
    el<HTMLInputElement>("set-sensitivity").addEventListener("input", (event) => {
      el("sensitivity-label").textContent = (Number((event.target as HTMLInputElement).value) / 100).toFixed(1);
    });
    el("camera-select").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-camera]");
      if (!btn) return;
      document.querySelectorAll<HTMLButtonElement>("#camera-select button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    el("btn-save-settings").addEventListener("click", () => {
      const quality = (document.querySelector<HTMLButtonElement>("#quality-select button.selected")?.dataset.quality ?? "high") as Settings["quality"];
      const camera = (document.querySelector<HTMLButtonElement>("#camera-select button.selected")?.dataset.camera ?? "chase") as Settings["camera"];
      const name = el<HTMLInputElement>("set-name").value.trim().slice(0, 16) || "TopGun";
      this.settings = {
        quality,
        masterVolume: Number(el<HTMLInputElement>("set-volume").value) / 100,
        sensitivity: Number(el<HTMLInputElement>("set-sensitivity").value) / 100,
        invertY: el<HTMLInputElement>("set-invert").checked,
        camera,
        showTracers: el<HTMLInputElement>("set-tracers").checked,
        playerName: name,
      };
      this.saveLocal();
      this.syncNames();
      this.actions?.onSaveSettings(this.settings);
      if (this.settingsFromPause) this.returnFromPauseSettings();
      else this.showScreen("menu");
    });
    el("btn-pause-settings").addEventListener("click", () => {
      this.settingsFromPause = true;
      this.syncSettingsControls();
      this.showScreen("settings");
      el("pause-screen").classList.add("hidden");
    });
  }

  private syncNames(): void {
    el<HTMLInputElement>("set-name").value = this.settings.playerName;
    el<HTMLInputElement>("mp-name").value = this.settings.playerName;
  }

  private bindMultiplayer(): void {
    el("btn-refresh-rooms").addEventListener("click", () => this.actions?.onRefreshRooms());
    el("btn-quick-match").addEventListener("click", () => {
      const name = el<HTMLInputElement>("mp-name").value.trim().slice(0, 16) || this.settings.playerName;
      this.settings.playerName = name;
      this.saveLocal();
      this.actions?.onQuickMatch(name);
    });
    el("mp-mode").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
      if (!btn) return;
      document.querySelectorAll<HTMLButtonElement>("#mp-mode button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    el("mp-privacy").addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-private]");
      if (!btn) return;
      document.querySelectorAll<HTMLButtonElement>("#mp-privacy button").forEach((b) => b.classList.toggle("selected", b === btn));
    });
    el("btn-create-room").addEventListener("click", () => {
      const name = el<HTMLInputElement>("mp-name").value.trim().slice(0, 16) || this.settings.playerName;
      this.settings.playerName = name;
      this.saveLocal();
      const mode = (document.querySelector<HTMLButtonElement>("#mp-mode button.selected")?.dataset.mode ?? "tdm") as GameMode;
      const isPrivate = document.querySelector<HTMLButtonElement>("#mp-privacy button.selected")?.dataset.private === "true";
      this.actions?.onCreateRoom({
        name,
        mode,
        maxPlayers: Number(el<HTMLSelectElement>("mp-max").value),
        isPrivate,
      });
    });
    el("btn-join-code").addEventListener("click", () => {
      const code = el<HTMLInputElement>("join-code").value.trim().toUpperCase();
      if (!code) {
        this.setMpError("ENTER A ROOM CODE FIRST.");
        return;
      }
      const name = el<HTMLInputElement>("mp-name").value.trim().slice(0, 16) || this.settings.playerName;
      this.actions?.onJoinCode(code, name);
    });
    el<HTMLInputElement>("join-code").addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") el("btn-join-code").click();
    });
  }

  private bindLobby(): void {
    el("btn-leave-lobby").addEventListener("click", () => this.actions?.onLeaveLobby());
    el("btn-copy-code").addEventListener("click", () => {
      const code = el("lobby-code").textContent ?? "";
      void navigator.clipboard?.writeText(code).then(() => this.showToast("ROOM CODE COPIED", 1.4)).catch(() => this.setLobbyStatus("COPY FAILED — READ IT OUT LOUD"));
    });
    el("btn-ready").addEventListener("click", () => {
      const me = this.lobby?.players.find((p) => p.id === this.lobby?.meId);
      this.actions?.onToggleReady(!me?.ready);
    });
    el("btn-host-start").addEventListener("click", () => this.actions?.onHostStart());
    el("btn-team-raf").addEventListener("click", () => this.actions?.onSetTeam("RAF"));
    el("btn-team-axis").addEventListener("click", () => this.actions?.onSetTeam("AXIS"));
    const send = () => {
      const input = el<HTMLInputElement>("lobby-chat-input");
      const text = input.value.trim();
      if (!text) return;
      this.actions?.onLobbyChatSend(text);
      input.value = "";
    };
    el("btn-lobby-chat").addEventListener("click", send);
    el<HTMLInputElement>("lobby-chat-input").addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") send();
    });
  }

  private bindHud(): void {
    el("btn-hud-menu").addEventListener("click", () => this.actions?.onPause());
    el("btn-resume").addEventListener("click", () => this.actions?.onResume());
    el("btn-quit-match").addEventListener("click", () => this.showLeaveConfirm());
    el("btn-cancel-leave").addEventListener("click", () => this.hideLeaveConfirm());
    el("btn-confirm-leave").addEventListener("click", () => {
      this.hideLeaveConfirm();
      this.actions?.onAbandon();
    });
    el("btn-rematch").addEventListener("click", () => this.actions?.onRematch());
    el("btn-results-menu").addEventListener("click", () => this.actions?.onReturnMenu());
    document.getElementById("touch-chat")?.addEventListener("click", () => this.actions?.onOpenChat());
  }

  private scoreTableHtml(rows: ScoreRow[], mode: GameMode): string {
    const head = `<thead><tr><th>#</th><th>PILOT</th><th>TEAM</th><th>K</th><th>D</th><th>SCORE</th></tr></thead>`;
    const body = rows.map((r, i) => `<tr class="${r.isPlayer ? "me" : ""}"><td>${i + 1}</td><td>${option(r.name)}${r.isBot ? ' <span style="color:#63768d">[AI]</span>' : ""}</td><td class="sb-team ${r.team === "RAF" ? "raf" : "axis"}">${mode === "ffa" ? "" : r.team}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.score}</td></tr>`).join("");
    return `<table>${head}<tbody>${body}</tbody></table>`;
  }

  setSettingsFromPause(value: boolean): void {
    this.settingsFromPause = value;
  }

  setLobbyChatSystem(name: string, text: string): void {
    if (this.currentScreen === "lobby") this.addLobbyChat(name, text, "SYSTEM");
  }
}
