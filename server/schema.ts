import { MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") team: "RAF" | "AXIS" = "RAF";
  @type("string") aircraft = "meadowhawk";
  @type("boolean") ready = false;
  @type("boolean") isHost = false;
  @type("boolean") alive = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") qx = 0;
  @type("number") qy = 0;
  @type("number") qz = 0;
  @type("number") qw = 1;
  @type("number") speed = 0;
  @type("number") boost = 100;
  @type("number") throttle = 0.7;
  @type("number") health = 100;
  @type("number") maxHealth = 100;
  @type("number") ammo = 320;
  @type("number") rockets = 4;
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("number") score = 0;
  @type("boolean") boosting = false;
  @type("number") lastProcessedInput = 0;
  @type("number") respawnIn = 0;
}

export class DogfightState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") phase: "lobby" | "playing" | "ended" = "lobby";
  @type("string") mode: "tdm" | "ffa" = "tdm";
  @type("string") hostId = "";
  @type("string") roomCode = "";
  @type("number") maxPlayers = 12;
  @type("boolean") isPrivate = false;
  @type("number") timeLeft = 0;
  @type("number") scoreRAF = 0;
  @type("number") scoreAXIS = 0;
}
