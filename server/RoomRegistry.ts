export interface RoomRecord {
  roomId: string;
  code: string;
  mode: "tdm" | "ffa";
  maxPlayers: number;
  clients: number;
  isPrivate: boolean;
  phase: "lobby" | "playing" | "ended";
  createdAt: number;
}

const registry = new Map<string, RoomRecord>();

export function upsertRoom(record: RoomRecord): void {
  registry.set(record.roomId, { ...record });
}

export function removeRoom(roomId: string): void {
  registry.delete(roomId);
}

export function listPublicRooms(): RoomRecord[] {
  return [...registry.values()]
    .filter((room) => !room.isPrivate && room.phase === "lobby")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function findRoomByCode(code: string): RoomRecord | undefined {
  return [...registry.values()].find((room) => room.code === code.toUpperCase());
}

export function codeExists(code: string): boolean {
  return [...registry.values()].some((room) => room.code === code);
}

export function roomCount(): number {
  return registry.size;
}
