import { createHmac } from "node:crypto";
import { Server } from "socket.io";
import users from "../Modals/Auth.js";
import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";
import { findMatchingTrustedDevice } from "../lib/trustedDevice.js";
import {
  cancelCallParticipantRemoval,
  canModerateCall,
  deleteCallRoom,
  deleteCallParticipant,
  enforceJoinRateLimit,
  getCallRoom,
  getCallRoomState,
  getPublicParticipants,
  persistCallRoomSettings,
  restoreCallRoom,
  scheduleCallParticipantRemoval,
} from "./rooms.js";

const MAX_SIGNAL_BYTES = 512_000;
const validRoomId = /^[A-F0-9]{12}$/;
const validSignalTypes = new Set(["offer", "answer", "ice-candidate"]);

const getSocketAuthRequest = (socket) => {
  const request = socket.request;
  const forwardedFor = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const trustedHops = Number(process.env.TRUST_PROXY_HOPS) || 0;
  const forwardedAddress =
    trustedHops > 0 && forwardedFor.length
      ? forwardedFor[Math.max(0, forwardedFor.length - trustedHops)]
      : undefined;
  return {
    headers: request.headers,
    socket: request.socket,
    ip:
      forwardedAddress ||
      socket.handshake.address ||
      request.socket.remoteAddress ||
      "unknown",
    get: (name) => request.headers[name.toLowerCase()],
  };
};

const getIceServers = (userId) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  const urls = (process.env.TURN_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const secret = process.env.TURN_SHARED_SECRET;
  if (!urls.length || !secret) return iceServers;

  const ttlSeconds = Math.min(
    Math.max(Number(process.env.TURN_TTL_SECONDS) || 3600, 300),
    86_400,
  );
  const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${userId}`;
  const credential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  iceServers.push({ urls, username, credential });
  return iceServers;
};

const sendRoomState = (io, room) => {
  io.to(room.roomId).emit("call:participants", getPublicParticipants(room));
  io.to(room.roomId).emit("call:settings", {
    locked: room.locked,
    chatEnabled: room.chatEnabled,
    screenShareEnabled: room.screenShareEnabled,
    recording: Boolean(room.recording),
  });
};

const emitParticipantRemoved = (io, room, participant, reason) => {
  if (participant.socketId) {
    io.to(participant.socketId).emit("call:removed", { reason });
    io.sockets.sockets.get(participant.socketId)?.disconnect(true);
  }
  deleteCallParticipant(room, participant.userId);
  sendRoomState(io, room);
};

const endCallRoom = async (io, room) => {
  io.to(room.roomId).emit("call:ended");
  for (const participant of room.participants.values()) {
    const connected =
      participant.socketId && io.sockets.sockets.get(participant.socketId);
    if (connected) {
      connected.leave(room.roomId);
      connected.data.roomId = null;
    }
    deleteCallParticipant(room, participant.userId);
  }
  await deleteCallRoom(room.roomId);
};

export const attachCallSignaling = (httpServer, allowedOrigin) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigin, credentials: true },
    maxHttpBufferSize: 1_500_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) {
        return next(new Error("Sign in is required"));
      }
      const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
      if (!decoded.email || !decoded.email_verified) {
        return next(new Error("A verified account is required"));
      }
      const user = await users.findOne({ email: decoded.email.toLowerCase() });
      if (!user) return next(new Error("User account not found"));
      const trustedDevice = await findMatchingTrustedDevice(
        getSocketAuthRequest(socket),
        user._id,
      );
      if (!trustedDevice) {
        return next(new Error("Complete email verification on this device first"));
      }
      socket.data.user = {
        userId: String(user._id),
        name: user.channelname || user.username || user.name || "User",
        image: user.image || "",
      };
      return next();
    } catch (error) {
      console.error("Call socket authentication failed:", error.message);
      return next(new Error("Call authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("call:ice-config", { iceServers: getIceServers(socket.data.user.userId) });

    socket.on("call:join", async (payload = {}, acknowledge) => {
      const acknowledgeResult =
        typeof acknowledge === "function" ? acknowledge : () => {};
      if (!payload || typeof payload !== "object") {
        return acknowledgeResult({ error: "Enter a valid meeting code." });
      }
      const { roomId } = payload;
      if (!enforceJoinRateLimit(socket.handshake.address || socket.id)) {
        return acknowledgeResult({ error: "Too many join attempts. Wait one minute and try again." });
      }
      if (typeof roomId !== "string" || !validRoomId.test(roomId)) {
        return acknowledgeResult({ error: "Enter a valid meeting code." });
      }
      let room;
      try {
        room = await restoreCallRoom(roomId);
      } catch (error) {
        console.error("Could not restore call room:", error.message);
        return acknowledgeResult({ error: "Could not load this meeting right now." });
      }
      if (!room) return acknowledgeResult({ error: "Meeting not found or expired." });

      const userId = socket.data.user.userId;
      const existing = room.participants.get(userId);
      if (room.locked && userId !== room.hostUserId && !existing) {
        return acknowledgeResult({ error: "The host has locked this meeting." });
      }
      if (existing?.online && existing.socketId !== socket.id) {
        io.sockets.sockets.get(existing.socketId)?.disconnect(true);
      }
      if (!existing && room.participants.size >= room.maxParticipants) {
        return acknowledgeResult({
          error: `This meeting is limited to ${room.maxParticipants} participants.`,
        });
      }

      cancelCallParticipantRemoval(roomId, userId);
      const participant = existing || {
        userId,
        name: socket.data.user.name,
        image: socket.data.user.image,
        muted: false,
        cameraEnabled: true,
        handRaised: false,
        screenSharing: false,
        mutedByHost: false,
        connectionQuality: "unknown",
        joinedAt: Date.now(),
        online: true,
        socketId: null,
      };
      participant.name = socket.data.user.name;
      participant.image = socket.data.user.image;
      participant.online = true;
      participant.socketId = socket.id;
      room.participants.set(userId, participant);
      socket.join(roomId);
      socket.data.roomId = roomId;

      acknowledgeResult({
        state: getCallRoomState(room),
        userId,
        iceServers: getIceServers(userId),
      });
      socket.to(roomId).emit("call:participant-joined", {
        userId,
        name: participant.name,
      });
      sendRoomState(io, room);
    });

    socket.on("peer:signal", (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const { targetUserId, type, signal } = payload;
      const room = getCallRoom(socket.data.roomId);
      const sender = room?.participants.get(socket.data.user.userId);
      const target = room?.participants.get(targetUserId);
      if (
        !room ||
        !sender?.online ||
        sender.socketId !== socket.id ||
        !target?.online ||
        !target.socketId ||
        !validSignalTypes.has(type)
      ) {
        return;
      }
      let serialized;
      try {
        serialized = JSON.stringify(signal);
      } catch {
        return;
      }
      if (!serialized || serialized.length > MAX_SIGNAL_BYTES) return;
      io.to(target.socketId).emit("peer:signal", {
        fromUserId: sender.userId,
        type,
        signal,
      });
    });

    socket.on("call:update", (update = {}) => {
      if (!update || typeof update !== "object") return;
      const room = getCallRoom(socket.data.roomId);
      const participant = room?.participants.get(socket.data.user.userId);
      if (!room || !participant || participant.socketId !== socket.id) return;
      for (const key of ["muted", "cameraEnabled", "handRaised", "screenSharing"]) {
        if (typeof update[key] === "boolean") {
          if (key === "muted" && participant.mutedByHost && !update[key]) continue;
          if (key !== "screenSharing" || room.screenShareEnabled || !update[key]) {
            participant[key] = update[key];
          }
        }
      }
      if (["good", "fair", "poor", "unknown"].includes(update.connectionQuality)) {
        participant.connectionQuality = update.connectionQuality;
      }
      sendRoomState(io, room);
    });

    socket.on("call:moderate", (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const { action, targetUserId, value } = payload;
      const room = getCallRoom(socket.data.roomId);
      const actorId = socket.data.user.userId;
      const actor = room?.participants.get(actorId);
      const target = room?.participants.get(targetUserId);
      if (
        !room ||
        !actor ||
        actor.socketId !== socket.id ||
        !target ||
        !canModerateCall(room, actorId)
      ) return;
      if (action === "mute") {
        if (target.userId === room.hostUserId && actorId !== room.hostUserId) return;
        if (target.socketId) io.to(target.socketId).emit("call:force-mute");
        target.muted = true;
        target.mutedByHost = true;
        sendRoomState(io, room);
      } else if (action === "remove") {
        if (
          target.userId === room.hostUserId ||
          (room.cohostIds.has(target.userId) && actorId !== room.hostUserId)
        ) return;
        emitParticipantRemoved(io, room, target, "The host removed you from the meeting.");
      } else if (action === "cohost" && actorId === room.hostUserId) {
        if (value) room.cohostIds.add(target.userId);
        else room.cohostIds.delete(target.userId);
        persistCallRoomSettings(room);
        sendRoomState(io, room);
      } else if (action === "allow-unmute" && target.mutedByHost) {
        target.mutedByHost = false;
        if (target.socketId) io.to(target.socketId).emit("call:allow-unmute");
        sendRoomState(io, room);
      }
    });

    socket.on("call:lock", (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const { locked } = payload;
      const room = getCallRoom(socket.data.roomId);
      const actor = room?.participants.get(socket.data.user.userId);
      if (
        !room ||
        !actor ||
        actor.socketId !== socket.id ||
        !canModerateCall(room, socket.data.user.userId)
      ) return;
      room.locked = Boolean(locked);
      persistCallRoomSettings(room);
      sendRoomState(io, room);
    });

    socket.on("call:permissions", (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const { chatEnabled, screenShareEnabled } = payload;
      const room = getCallRoom(socket.data.roomId);
      const actor = room?.participants.get(socket.data.user.userId);
      if (
        !room ||
        !actor ||
        actor.socketId !== socket.id ||
        room.hostUserId !== socket.data.user.userId
      ) return;
      if (typeof chatEnabled === "boolean") room.chatEnabled = chatEnabled;
      if (typeof screenShareEnabled === "boolean") {
        room.screenShareEnabled = screenShareEnabled;
        if (!screenShareEnabled) {
          for (const participant of room.participants.values()) {
            if (participant.screenSharing && participant.socketId) {
              io.to(participant.socketId).emit("call:stop-screen-share");
              participant.screenSharing = false;
            }
          }
        }
      }
      persistCallRoomSettings(room);
      sendRoomState(io, room);
    });

    socket.on("call:recording", (payload = {}) => {
      if (!payload || typeof payload.recording !== "boolean") return;
      const room = getCallRoom(socket.data.roomId);
      const actor = room?.participants.get(socket.data.user.userId);
      if (!room || !actor || actor.socketId !== socket.id || room.hostUserId !== actor.userId) {
        return;
      }
      room.recording = payload.recording;
      io.to(room.roomId).emit("call:recording", { recording: room.recording });
    });

    socket.on("call:end", () => {
      const room = getCallRoom(socket.data.roomId);
      if (!room || room.hostUserId !== socket.data.user.userId) return;
      void endCallRoom(io, room);
    });

    socket.on("call:leave", () => {
      const room = getCallRoom(socket.data.roomId);
      if (!room) return;
      const userId = socket.data.user.userId;
      const participant = room.participants.get(userId);
      if (!participant) return;
      if (userId === room.hostUserId) {
        void endCallRoom(io, room);
        return;
      }
      deleteCallParticipant(room, userId);
      socket.leave(room.roomId);
      socket.data.roomId = null;
      sendRoomState(io, room);
    });

    socket.on("disconnect", () => {
      const room = getCallRoom(socket.data.roomId);
      if (!room) return;
      const participant = room.participants.get(socket.data.user.userId);
      if (!participant || participant.socketId !== socket.id) return;
      if (participant.userId === room.hostUserId && room.recording) {
        room.recording = false;
        io.to(room.roomId).emit("call:recording", { recording: false });
      }
      participant.online = false;
      participant.socketId = null;
      io.to(room.roomId).emit("call:participant-offline", {
        userId: participant.userId,
      });
      sendRoomState(io, room);
      scheduleCallParticipantRemoval(io, room, participant);
    });
  });

  return io;
};
