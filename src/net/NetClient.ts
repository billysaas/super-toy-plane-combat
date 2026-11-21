import { Client, type Room } from "colyseus.js";
import { AIRCRAFT } from "../../shared/config";
import type { LobbyPlayerView, LobbyStateView, RoomSummary } from "../ui/UI";
import type { InputPacket } from "../../shared/types";

export type NetEventName =
  | "system"
  | "chat"
  | "shot"
  | "hit"
  | "kill"
  | "explosion"
  | "rocketSpawn"
  | "impact"
  | "respawn"
  | "matchStart"
  | "matchEnd"
  | "roomError";

export interface NetEvents {
  onServerStatus?: (status: "connecting" | "online" | "offline", text: string) => void;
  onRooms?: (rooms: RoomSummary[]) => void;
  onJoined?: (room: Room) => void;
  onLobby?: (state: LobbyStateView) => void;
  onPhase?: (phase: "lobby" | "playing" | "ended", state: unknown) => void;
  onEvent?: (event: NetEventName, payload: any) => void;
  onError?: (message: string) => void;
  onLeave?: (code: number) => void;
}

interface PlayerLike {
  name: string;
  team: "RAF" | "AXIS";
  aircraft: string;
  ready: boolean;
  isHost: boolean;
}

interface StateLike {
  phase: "lobby" | "playing" | "ended";
  mode: "tdm" | "ffa";
  hostId: string;
  roomCode: string;
  maxPlayers: number;
  isPrivate: boolean;
  timeLeft: number;
  scoreRAF: number;
  scoreAXIS: number;
  players: {
    forEach: (cb: (player: PlayerLike, key: string) => void) => void;
    size: number;
  };
}

export function getServerUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  const { protocol, hostname, port, origin } = window.location;
  if (port === "5173" || port === "5174" || port === "4174") return `${protocol}//${hostname}:2567`;
  return origin;
}

function normalizeRooms(payload: { rooms?: Array<{ roomId: string; code: string; mode: "tdm" | "ffa"; maxPlayers: number; clients: number; isPrivate: boolean }> }): RoomSummary[] {
  return (payload.rooms ?? []).map((room) => ({
    roomId: room.roomId,
    code: room.code,
    mode: room.mode,
    maxClients: room.maxPlayers,
    clients: room.clients,
    isPrivate: room.isPrivate,
  }));
}

export class NetClient {
  private client: Client;
  private events: NetEvents = {};
  room?: Room;
  private baseUrl: string;
  private playerName = "TopGun";
  private aircraftId = AIRCRAFT[0].id;

  constructor() {
    this.baseUrl = getServerUrl();
    this.client = new Client(this.baseUrl);
  }

  setEvents(events: NetEvents): void {
    this.events = events;
  }

  setIdentity(name: string, aircraftId: string): void {
    this.playerName = name;
    this.aircraftId = aircraftId;
  }

  async listRooms(): Promise<RoomSummary[]> {
    this.events.onServerStatus?.("connecting", "checking");
    try {
      const response = await fetch(`${this.baseUrl}/api/rooms`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { rooms?: Parameters<typeof normalizeRooms>[0]["rooms"] };
      const rooms = normalizeRooms(data);
      this.events.onRooms?.(rooms);
      this.events.onServerStatus?.("online", "online");
      return rooms;
    } catch (error) {
      this.events.onServerStatus?.("offline", "offline");
      this.events.onError?.(`CANNOT REACH MULTIPLAYER SERVER: ${(error as Error).message.toUpperCase()}`);
      return [];
    }
  }

  async quickMatch(name: string, aircraftId: string): Promise<void> {
    this.setIdentity(name, aircraftId);
    this.events.onServerStatus?.("connecting", "matchmaking");
    this.events.onError?.("");
    try {
      const rooms = await this.listRooms();
      const best = rooms.find((room) => room.clients < room.maxClients);
      if (best) {
        await this.joinById(best.roomId);
        return;
      }
      await this.create({ mode: "tdm", maxPlayers: 12, isPrivate: false });
    } catch (error) {
      this.handleJoinError(error);
    }
  }

  async create(options: { mode: "tdm" | "ffa"; maxPlayers: number; isPrivate: boolean }): Promise<void> {
    this.events.onServerStatus?.("connecting", "creating");
    try {
      const room = await this.client.create("dogfight", {
        mode: options.mode,
        maxPlayers: options.maxPlayers,
        isPrivate: options.isPrivate,
        name: this.playerName,
        aircraft: this.aircraftId,
      });
      this.attachRoom(room);
    } catch (error) {
      this.handleJoinError(error);
    }
  }

  async joinById(roomId: string): Promise<void> {
    this.events.onServerStatus?.("connecting", "joining");
    try {
      const room = await this.client.joinById(roomId, {
        name: this.playerName,
        aircraft: this.aircraftId,
      });
      this.attachRoom(room);
    } catch (error) {
      this.handleJoinError(error);
    }
  }

  async joinCode(code: string, name: string, aircraftId: string): Promise<void> {
    this.setIdentity(name, aircraftId);
    this.events.onServerStatus?.("connecting", "finding room");
    this.events.onError?.("");
    try {
      const response = await fetch(`${this.baseUrl}/api/rooms/find?code=${encodeURIComponent(code.toUpperCase())}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "ROOM NOT FOUND.");
      }
      const data = await response.json() as { roomId: string };
      await this.joinById(data.roomId);
    } catch (error) {
      this.handleJoinError(error);
    }
  }

  private handleJoinError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.events.onServerStatus?.("online", "online");
    this.events.onError?.(message.toUpperCase());
  }

  private attachRoom(room: Room): void {
    this.room = room;
    this.events.onServerStatus?.("online", "online");
    this.events.onJoined?.(room);
    room.onMessage("*", (type: string | number, payload: unknown) => {
      if (type === "roomError") {
        const p = payload as { message?: string };
        this.events.onError?.(p?.message ?? "ROOM ERROR");
        return;
      }
      this.events.onEvent?.(String(type) as NetEventName, payload);
    });
    room.onStateChange((state) => {
      const s = state as unknown as StateLike;
      const players: LobbyPlayerView[] = [];
      s.players.forEach((player, id) => {
        players.push({
          id,
          name: player.name,
          team: player.team,
          aircraft: player.aircraft,
          ready: player.ready,
          isHost: player.isHost,
          isMe: id === room.sessionId,
        });
      });
      const lobby: LobbyStateView = {
        code: s.roomCode,
        mode: s.mode,
        maxPlayers: s.maxPlayers,
        players,
        phase: s.phase,
        meId: room.sessionId,
        hostId: s.hostId,
      };
      this.events.onLobby?.(lobby);
      this.events.onPhase?.(s.phase, state);
    });
    room.onLeave((code) => {
      this.room = undefined;
      this.events.onLeave?.(code);
    });
    room.onError((_code, message) => {
      this.events.onError?.(message?.toUpperCase() ?? "ROOM CONNECTION ERROR");
    });
    room.send("ready", false);
  }

  setReady(ready: boolean): void {
    this.room?.send("ready", ready);
  }

  setTeam(team: "RAF" | "AXIS"): void {
    this.room?.send("team", team);
  }

  setAircraft(aircraftId: string): void {
    this.aircraftId = aircraftId;
    this.room?.send("aircraft", aircraftId);
  }

  startMatch(): void {
    this.room?.send("start");
  }

  sendChat(text: string): void {
    this.room?.send("chat", text);
  }

  sendInput(packet: InputPacket): void {
    this.room?.send("input", packet);
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = undefined;
    if (room) await room.leave().catch(() => undefined);
  }

  get sessionId(): string {
    return this.room?.sessionId ?? "";
  }

  get joined(): boolean {
    return Boolean(this.room);
  }
}
