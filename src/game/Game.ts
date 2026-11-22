import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  PCFShadowMap,
  Quaternion,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { Room } from "colyseus.js";
import { STATIC_BOXES } from "../../shared/worldLayout";
import { AIRCRAFT, DEFAULT_THROTTLE, type Settings, type SoloConfig } from "../../shared/config";
import { AssetStore } from "./AssetStore";
import { Environment } from "./Environment";
import { PhysicsWorld } from "./PhysicsWorld";
import { InputManager } from "./Input";
import { AudioManager } from "./Audio";
import { Effects } from "./Effects";
import { CameraRig } from "./CameraRig";
import { AircraftView } from "./AircraftView";
import { LocalMatch } from "./LocalMatch";
import { OnlineMatch } from "./OnlineMatch";
import type { ActiveMatch } from "./ActiveMatch";
import { UIManager, type ScreenName, type UIActions, type CreateRoomOptions } from "../ui/UI";
import { NetClient, type NetEventName } from "../net/NetClient";
import type { PlaneRuntime } from "../../shared/types";

export class Game {
  private root: HTMLElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private clock = new Clock();
  private assets = new AssetStore();
  private ui = new UIManager();
  private input: InputManager;
  private audio = new AudioManager();
  private net = new NetClient();
  private physics?: PhysicsWorld;
  private cameraRig?: CameraRig;
  private environment?: Environment;
  private effects?: Effects;
  private match: ActiveMatch | null = null;
  private onlineMatch: OnlineMatch | null = null;
  private activeMode: "solo" | "online" | null = null;
  private soloConfig: SoloConfig | null = null;
  private settings: Settings;
  private paused = false;
  private ended = false;
  private elapsed = 0;
  private menuPlane?: AircraftView;
  private menuRuntime?: PlaneRuntime;
  private audioUnlocked = false;
  private lastPointerPrompt = false;
  private quality: Settings["quality"];
  private resizeHandler = () => this.resize();
  private chatPaused = false;
  private latestLobbyHost = "";
  private roomsBusy = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = this.ui.settings;
    this.quality = this.settings.quality;
    const canvas = document.createElement("canvas");
    canvas.id = "game-canvas";
    canvas.setAttribute("aria-label", "Super Toy Plane Combat game view");
    this.root.appendChild(canvas);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance", preserveDrawingBuffer: import.meta.env.DEV });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(new Color(0x0a1728));
    this.input = new InputManager(canvas);
    this.ui.setTouchMode(this.input.usesTouch);
    this.ui.setActions(this.actions());
    this.input.setSettings(this.settings);
    this.audio.setVolume(this.settings.masterVolume);
    this.bindGlobalEvents();
    this.bindNetwork();
    this.resize();
    if (import.meta.env.DEV) {
      (window as unknown as { __game: Game }).__game = this;
    }
  }

  async init(): Promise<void> {
    this.ui.setLoading(0.04, "Winding the propeller...");
    try {
      await this.assets.loadAll((loaded, total, label) => {
        this.ui.setLoading(0.05 + (loaded / total) * 0.58, `Loading ${label.replace(/-/g, " ")}`);
      });
      this.ui.setLoading(0.7, "Assembling the toy house...");
      this.physics = await PhysicsWorld.create(STATIC_BOXES);
      this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight, this.physics);
      this.ui.setLoading(0.82, "Painting the garden...");
      this.environment = new Environment(this.scene, this.assets, this.quality);
      this.environment.build();
      this.effects = new Effects(this.scene, this.quality);
      this.effects.tracersEnabled = this.settings.showTracers;
      this.spawnMenuPlane();
      this.applyQuality(this.quality);
      this.ui.setLoading(1, "Ready for takeoff");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      this.ui.hideLoading();
      this.ui.showScreen("menu", false);
      this.clock.start();
      this.animate();
    } catch (error) {
      console.error(error);
      this.ui.setLoading(1, "Engine failure - check console");
      const label = document.getElementById("loading-label");
      if (label) label.textContent = "COULD NOT START THE TOY BOX. CHECK YOUR BROWSER CONSOLE.";
    }
  }

  private actions(): UIActions {
    return {
      onStartSolo: (config) => this.startSolo(config),
      onRefreshRooms: () => void this.refreshRooms(),
      onQuickMatch: (name) => void this.quickMatch(name),
      onCreateRoom: (options) => void this.createRoom(options),
      onJoinRoom: (roomId) => void this.joinRoom(roomId),
      onJoinCode: (code, name) => void this.joinCode(code, name),
      onLeaveLobby: () => void this.leaveOnline("multiplayer"),
      onToggleReady: (ready) => this.net.setReady(ready),
      onSetTeam: (team) => this.net.setTeam(team),
      onSetAircraft: (aircraftId) => this.setAircraft(aircraftId),
      onHostStart: () => this.net.startMatch(),
      onSaveSettings: (settings) => this.applySettings(settings),
      onResume: () => this.resume(),
      onPause: () => this.pause(),
      onAbandon: () => this.leaveActive("menu"),
      onRematch: () => this.rematch(),
      onReturnMenu: () => this.leaveActive("menu"),
      onChatSend: (text) => this.sendChat(text),
      onLobbyChatSend: (text) => this.net.sendChat(text),
      onOpenChat: () => this.openChat(),
      onScreenChange: (screen) => this.screenChanged(screen),
      onTouchVisible: (visible) => this.input.setTouchVisible(visible),
    };
  }

  private bindGlobalEvents(): void {
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("orientationchange", this.resizeHandler);
    const unlock = () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      this.audio.init();
      this.audio.setVolume(this.settings.masterVolume);
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.match && !this.paused && !this.ended) this.pause();
    });
    window.addEventListener("contextmenu", (event) => {
      if ((event.target as HTMLElement).tagName === "CANVAS") event.preventDefault();
    });
  }

  private bindNetwork(): void {
    this.net.setEvents({
      onServerStatus: (status, text) => this.ui.setServerStatus(status, text),
      onRooms: (rooms) => this.ui.setRoomList(rooms),
      onJoined: (room) => this.onRoomJoined(room),
      onLobby: (state) => this.onLobbyState(state),
      onPhase: (phase) => this.onPhaseChange(phase),
      onEvent: (name, payload) => this.onNetEvent(name, payload),
      onError: (message) => {
        this.ui.setMpConnecting(false);
        if (message) {
          this.ui.setMpError(message);
          if (this.match) this.ui.showToast(message, 2.8);
        }
      },
      onLeave: () => this.onRoomLeft(),
    });
  }

  private async refreshRooms(): Promise<void> {
    if (this.roomsBusy) return;
    this.roomsBusy = true;
    this.ui.setMpConnecting(true, "SCANNING THE SKIES...");
    try {
      await this.net.listRooms();
    } finally {
      this.roomsBusy = false;
      this.ui.setMpConnecting(false);
    }
  }

  private async quickMatch(name: string): Promise<void> {
    this.net.setIdentity(name, this.ui.aircraftId);
    this.ui.setMpError("");
    this.ui.setMpConnecting(true, "FINDING AN OPEN SORTIE...");
    try {
      await this.net.quickMatch(name, this.ui.aircraftId);
    } finally {
      this.ui.setMpConnecting(false);
    }
  }

  private async createRoom(options: CreateRoomOptions): Promise<void> {
    this.net.setIdentity(options.name, this.ui.aircraftId);
    this.ui.setMpError("");
    this.ui.setMpConnecting(true, "BUILDING A NEW SORTIE...");
    try {
      await this.net.create({ mode: options.mode, maxPlayers: options.maxPlayers, isPrivate: options.isPrivate });
    } finally {
      this.ui.setMpConnecting(false);
    }
  }

  private async joinRoom(roomId: string): Promise<void> {
    this.net.setIdentity(this.ui.getPlayerName(), this.ui.aircraftId);
    this.ui.setMpError("");
    this.ui.setMpConnecting(true, "JOINING SORTIE...");
    try {
      await this.net.joinById(roomId);
    } finally {
      this.ui.setMpConnecting(false);
    }
  }

  private async joinCode(code: string, name: string): Promise<void> {
    this.ui.setMpError("");
    this.ui.setMpConnecting(true, "LOOKING UP ROOM CODE...");
    try {
      await this.net.joinCode(code, name, this.ui.aircraftId);
    } finally {
      this.ui.setMpConnecting(false);
    }
  }

  private onRoomJoined(room: Room): void {
    this.activeMode = "online";
    this.ended = false;
    this.paused = false;
    this.input.setEnabled(false);
    this.ui.setMpConnecting(false);
    this.ui.clearLobbyChat();
    this.ui.hideResults();
    this.ui.hidePause();
    this.ui.hideHud();
    this.ui.addLobbyChat("CONTROL", "LINK ESTABLISHED. WAITING FOR PILOTS.", "SYSTEM");
    this.ui.showScreen("lobby", false);
    this.menuPlane && (this.menuPlane.group.visible = false);
    this.audio.stopEngine();
    this.latestLobbyHost = "";
    void room;
  }

  private onLobbyState(state: { code: string; mode: "tdm" | "ffa"; maxPlayers: number; players: any[]; phase: string; meId: string; hostId: string }): void {
    this.latestLobbyHost = state.hostId;
    if (state.phase === "lobby" && !this.onlineMatch) {
      this.ui.showLobby(state);
      this.menuPlane && (this.menuPlane.group.visible = false);
    }
  }

  private onPhaseChange(phase: "lobby" | "playing" | "ended"): void {
    if (this.activeMode !== "online") return;
    if (phase === "playing") {
      if (this.onlineMatch && !this.ended) return;
      this.startOnlineMatch();
    } else if (phase === "ended") {
      if (this.ended) return;
      if (!this.onlineMatch) return;
      const result = this.onlineMatch.getResult();
      if (!result) return;
      this.ended = true;
      this.paused = false;
      this.input.setEnabled(false);
      this.input.releasePointerLock();
      this.ui.hidePause();
      this.ui.hideScoreboard();
      this.audio.stopEngine();
      this.ui.showResults(result);
    } else if (phase === "lobby") {
      if (this.onlineMatch) {
        this.onlineMatch.dispose();
        this.onlineMatch = null;
        this.match = null;
        this.ended = false;
        this.ui.hideHud();
        this.ui.hideResults();
        this.ui.hidePause();
        this.input.setEnabled(false);
      }
    }
  }

  private onNetEvent(name: NetEventName, payload: any): void {
    if (name === "chat") {
      this.ui.addChat(payload.name, payload.text, payload.team);
      if (this.ui.currentScreen === "lobby") this.ui.addLobbyChat(payload.name, payload.text, payload.team);
      return;
    }
    if (name === "system") {
      const text = String(payload?.text ?? "");
      if (this.ui.currentScreen === "lobby") this.ui.addLobbyChat("CONTROL", text, "SYSTEM");
      else this.ui.addChat("CONTROL", text, "SYSTEM");
      return;
    }
    if (name === "roomError") {
      this.ui.setMpError(payload?.message ?? "ROOM ERROR");
      this.ui.showToast(payload?.message ?? "ROOM ERROR", 2.4);
      return;
    }
    this.onlineMatch?.handleNetEvent(name, payload);
  }

  private onRoomLeft(): void {
    if (this.activeMode !== "online") return;
    if (this.onlineMatch) {
      this.onlineMatch.dispose();
      this.onlineMatch = null;
      this.match = null;
    }
    this.activeMode = null;
    this.ended = false;
    this.paused = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.ui.hideHud();
    this.ui.hideResults();
    this.ui.hidePause();
    this.ui.hideScoreboard();
    this.audio.stopEngine();
    this.ui.showScreen("multiplayer", false);
    this.net.listRooms().catch(() => undefined);
  }

  private startOnlineMatch(): void {
    if (!this.physics || !this.effects || !this.cameraRig || !this.net.room) return;
    this.endCurrentSession();
    this.activeMode = "online";
    this.ended = false;
    this.paused = false;
    this.menuPlane && (this.menuPlane.group.visible = false);
    this.ui.enterGame();
    this.input.clear();
    this.input.setEnabled(true);
    const match = new OnlineMatch({
      scene: this.scene,
      assets: this.assets,
      physics: this.physics,
      effects: this.effects,
      audio: this.audio,
      input: this.input,
      camera: this.cameraRig,
      settings: this.settings,
      room: this.net.room,
      callbacks: {
        onKilled: () => this.ui.showToast("SHOT DOWN · REDEPLOYING...", 2),
        onSpawn: () => this.ui.showToast("REDEPLOYED", 1.4),
        onKillFeed: (event) => this.ui.addKill(event),
      },
    });
    this.onlineMatch = match;
    this.match = match;
    if (!this.input.usesTouch) this.input.requestPointerLock();
    this.ui.showToast("ONLINE SORTIE · GOOD HUNTING", 2.2);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1.1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.cameraRig?.resize(w, h);
    this.ui.setLockPrompt(false);
  }

  private applyQuality(quality: Settings["quality"]): void {
    this.quality = quality;
    const dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : quality === "medium" ? 1.5 : 1.1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = quality !== "low";
    this.environment?.setQuality(quality);
    this.effects?.setQuality(quality);
    if (this.cameraRig) this.resize();
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    if (this.effects) this.effects.tracersEnabled = settings.showTracers;
    this.input.setSettings(settings);
    this.audio.setVolume(settings.masterVolume);
    this.applyQuality(settings.quality);
    this.ui.settings = settings;
  }

  private setAircraft(aircraftId: string): void {
    this.ui.aircraftId = aircraftId;
    if (this.activeMode === "online" && !this.onlineMatch) this.net.setAircraft(aircraftId);
    if (this.menuPlane) {
      this.scene.remove(this.menuPlane.group);
      this.menuPlane = undefined;
    }
    if (!this.match) this.spawnMenuPlane();
  }

  private spawnMenuPlane(): void {
    const aircraft = this.ui.aircraftId;
    const def = AIRCRAFT.find((a) => a.id === aircraft) ?? AIRCRAFT[0];
    const view = new AircraftView(this.assets, def, "RAF", this.quality !== "low");
    const runtime: PlaneRuntime = {
      id: "menu",
      name: "MENU",
      team: "RAF",
      aircraftId: aircraft,
      flight: { x: -24, y: 6.2, z: 8, qx: 0, qy: 0, qz: 0, qw: 1, speed: 18, boost: 100, throttle: DEFAULT_THROTTLE },
      health: 100, maxHealth: 100, ammo: 320, rockets: 4, alive: true, respawnAt: 0,
      invulnerableUntil: 0, fireCooldown: 0, rocketCooldown: 0, kills: 0, deaths: 0, score: 0, lastHitAt: 0, isBot: false,
    };
    this.menuRuntime = runtime;
    view.group.visible = true;
    view.group.scale.setScalar(1.55);
    this.scene.add(view.group);
    this.menuPlane = view;
  }

  private screenChanged(screen: ScreenName): void {
    this.lastPointerPrompt = false;
    this.ui.setLockPrompt(false);
    if (this.match && !this.ended && !this.paused) return;
    if (!this.match || this.ended) {
      const showPlane = screen === "menu" || screen === "hangar" || screen === "solo" || screen === "settings" || screen === "tutorial";
      this.menuPlane && (this.menuPlane.group.visible = showPlane);
    }
  }

  private startSolo(config: SoloConfig): void {
    if (!this.physics || !this.effects || !this.cameraRig) return;
    void this.net.leave();
    this.activeMode = "solo";
    this.endCurrentSession();
    this.settings.playerName = this.ui.getPlayerName();
    this.soloConfig = { ...config };
    this.paused = false;
    this.ended = false;
    this.menuPlane && (this.menuPlane.group.visible = false);
    this.ui.enterGame();
    this.input.clear();
    this.input.setEnabled(true);
    const match = new LocalMatch(
      {
        scene: this.scene,
        assets: this.assets,
        physics: this.physics,
        effects: this.effects,
        audio: this.audio,
        input: this.input,
        camera: this.cameraRig,
        settings: this.settings,
        playerName: this.settings.playerName,
        callbacks: {
          onKill: (event) => this.ui.addKill(event),
          onChat: (name, text, team) => this.ui.addChat(name, text, team),
          onMatchEnd: (result) => {
            this.ended = true;
            this.input.setEnabled(false);
            this.input.releasePointerLock();
            this.ui.showResults(result);
          },
          onHit: () => undefined,
          onKilled: () => this.ui.showToast("SHOT DOWN · EJECTING...", 2),
          onSpawn: () => this.ui.showToast("REDEPLOYED", 1.5),
        },
      },
      config,
    );
    this.match = match;
    if (!this.input.usesTouch) this.input.requestPointerLock();
    this.ui.showToast(config.mode === "tdm" ? "TEAM DEATHMATCH" : "FREE FOR ALL", 1.8);
  }

  private startRematch(): void {
    if (!this.soloConfig) return;
    const config = { ...this.soloConfig };
    this.endCurrentSession();
    this.ui.hideResults();
    this.startSolo(config);
  }

  private rematch(): void {
    if (this.activeMode === "online") {
      if (this.net.sessionId && this.latestLobbyHost === this.net.sessionId) {
        this.net.startMatch();
        this.ui.showToast("RESTARTING SORTIE...", 1.6);
      } else {
        this.ui.showToast("WAITING FOR THE HOST...", 1.8);
      }
      return;
    }
    this.startRematch();
  }

  private pause(): void {
    if (!this.match || this.ended || this.paused) return;
    this.paused = true;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.ui.hideScoreboard();
    this.ui.showPause();
    this.match.setPaused(true);
  }

  private resume(): void {
    if (!this.match || this.ended) return;
    this.paused = false;
    this.ui.hidePause();
    document.querySelectorAll<HTMLElement>(".screen").forEach((s) => s.classList.remove("active"));
    this.input.setEnabled(true);
    this.input.clear();
    this.match.setPaused(false);
    if (!this.input.usesTouch) this.input.requestPointerLock();
  }

  private leaveActive(destination: "menu" | "multiplayer"): void {
    if (this.activeMode === "online") {
      this.leaveOnline(destination);
      return;
    }
    this.endCurrentSession();
    this.activeMode = null;
    this.soloConfig = null;
    this.paused = false;
    this.ended = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.ui.showMenu();
    this.ui.hideHud();
    this.menuPlane && (this.menuPlane.group.visible = !this.net.joined);
    this.audio.stopEngine();
  }

  private leaveOnline(destination: "menu" | "multiplayer"): void {
    this.activeMode = null;
    const room = this.net.room;
    this.endCurrentSession();
    this.net.leave().catch(() => undefined);
    this.onlineMatch = null;
    this.paused = false;
    this.ended = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.audio.stopEngine();
    this.ui.hideHud();
    this.ui.hidePause();
    this.ui.hideResults();
    this.menuPlane && (this.menuPlane.group.visible = true);
    if (destination === "menu") this.ui.showMenu();
    else {
      this.ui.showScreen("multiplayer", false);
      void room;
      this.refreshRooms();
    }
  }

  private endCurrentSession(): void {
    this.match?.dispose();
    this.match = null;
    if (this.onlineMatch) {
      this.onlineMatch = null;
    }
    this.ui.hideScoreboard();
    this.ui.hidePause();
    this.ui.hideResults();
    this.audio.stopEngine();
  }

  private openChat(): void {
    if (!this.match || this.ended) return;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.chatPaused = false;
    if (this.match instanceof LocalMatch && !this.paused) {
      this.chatPaused = true;
      this.match.setPaused(true);
    }
    this.ui.openChat(
      (text) => {
        this.match?.sendChat(text);
      },
      () => {
        if (this.chatPaused) {
          this.chatPaused = false;
          this.match?.setPaused(false);
        }
        if (!this.paused && !this.ended) {
          this.input.setEnabled(true);
          if (!this.input.usesTouch) this.input.requestPointerLock();
        }
      },
    );
  }

  private sendChat(text: string): void {
    this.match?.sendChat(text);
  }

  private updateActions(): void {
    const actions = this.input.consumeActions();
    for (const action of actions) {
      if (action === "pause") {
        if (this.ui.dismissLeaveConfirm()) continue;
        if (!this.match) continue;
        if (this.paused) this.resume();
        else this.pause();
      } else if (action === "camera") {
        if (!this.match || this.ended || this.paused) continue;
        const mode = this.match.toggleCamera();
        this.ui.showToast(mode === "chase" ? "CHASE CAMERA" : "COCKPIT CAMERA", 1.1);
      } else if (action === "mute") {
        this.audio.setMuted(!this.audio.isMuted);
        this.ui.showToast(this.audio.isMuted ? "AUDIO MUTED" : "AUDIO ON", 1.1);
      } else if (action === "chat") {
        if (!this.paused && !this.ended) this.openChat();
      }
    }
  }

  private update(realDt: number): void {
    this.elapsed += realDt;
    if (this.environment) this.environment.update(realDt, this.elapsed);
    if (this.match && !this.paused && !this.ended) {
      this.match.update(realDt);
      if (!this.ended) {
        this.ui.updateHud(this.match.getHud());
        const needPointer = !this.input.usesTouch && !this.input.isLocked && !this.ui.isChatOpen;
        if (needPointer !== this.lastPointerPrompt) {
          this.lastPointerPrompt = needPointer;
          this.ui.setLockPrompt(needPointer);
        }
        const held = this.input.isScoreboardHeld();
        if (held) this.ui.showScoreboard(this.match.getScoreboard(), this.match.getMode());
        else this.ui.hideScoreboard();
      }
    } else if (!this.match) {
      this.ui.setLockPrompt(false);
      if (this.menuPlane && this.menuRuntime && this.cameraRig) {
        const screen = this.ui.currentScreen;
        this.menuPlane.group.visible = screen === "menu" || screen === "hangar" || screen === "solo" || screen === "settings" || screen === "tutorial";
        if (screen === "menu" || screen === "hangar" || screen === "solo") {
          this.menuRuntime.flight.qy = Math.sin(this.elapsed * 0.18) * 0.35;
          const q = new Quaternion(0, this.menuRuntime.flight.qy, 0, 0).normalize();
          this.menuRuntime.flight.qx = q.x;
          this.menuRuntime.flight.qz = q.z;
          this.menuRuntime.flight.qw = q.w;
          this.menuRuntime.flight.y = 6.2 + Math.sin(this.elapsed * 0.7) * 0.12;
          this.menuPlane.sync(this.menuRuntime, realDt, false);
        }
      }
      if (this.cameraRig) this.cameraRig.updateMenu(this.elapsed, this.cameraRig.camera.aspect);
    }
    this.updateActions();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    if (this.cameraRig) this.renderer.render(this.scene, this.cameraRig.camera);
  };

}
