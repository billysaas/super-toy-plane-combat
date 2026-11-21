import http from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DogfightRoom } from "./DogfightRoom";
import { findRoomByCode, listPublicRooms, roomCount } from "./RoomRegistry";

try {
  process.loadEnvFile?.();
} catch {
  void 0;
}

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.PORT || 2567);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json({ limit: "16kb" }));

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 5000,
    pingMaxRetries: 3,
  }),
});
gameServer.define("dogfight", DogfightRoom);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, rooms: roomCount(), uptime: process.uptime() });
});

app.get("/api/rooms", (_req, res) => {
  res.json({
    rooms: listPublicRooms().map(({ roomId, code, mode, maxPlayers, clients, isPrivate }) => ({
      roomId, code, mode, maxPlayers, clients, isPrivate,
    })),
  });
});

app.get("/api/rooms/find", (req, res) => {
  const code = String(req.query.code ?? "").toUpperCase();
  const room = findRoomByCode(code);
  if (!room) {
    res.status(404).json({ error: "ROOM NOT FOUND OR ALREADY AIRBORNE." });
    return;
  }
  if (room.phase !== "lobby") {
    res.status(409).json({ error: "THAT MATCH IS ALREADY IN PROGRESS." });
    return;
  }
  res.json({ roomId: room.roomId, code: room.code, mode: room.mode, clients: room.clients, maxPlayers: room.maxPlayers });
});

const distDir = resolve(process.cwd(), "dist");
if (existsSync(resolve(distDir, "index.html"))) {
  app.use(express.static(distDir, { maxAge: "1h", index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/matchmake/") || req.path.startsWith("/process/")) {
      next();
      return;
    }
    res.sendFile(resolve(distDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("text/plain").send("Super Toy Plane Combat server is running. Start the Vite dev server or build the client.");
  });
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Super Toy Plane Combat server listening on http://0.0.0.0:${port}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
