import { randomBytes } from "node:crypto";
import CallRoom from "../Modals/callRoom.js";

export const MAX_CALL_PARTICIPANTS = 4;
export const CALL_RECONNECT_GRACE_MS = 30_000;

const rooms = new Map();
const deletingRooms = new Set();
const removeTimers = new Map();
const roomExpiryTimers = new Map();
const ROOM_LIFETIME_MS = 4 * 60 * 60 * 1000;

const makeRoomId = () => randomBytes(6).toString("hex").toUpperCase();

const scheduleExpiry = (room) => {
  const timer = setTimeout(
    () => {
      void deleteCallRoom(room.roomId);
    },
    Math.max(0, room.expiresAt - Date.now()),
  );
  timer.unref?.();
  roomExpiryTimers.set(room.roomId, timer);
};

const toRuntimeRoom = (stored) => {
  const createdAt = new Date(stored.createdAt).getTime();
  const room = {
    roomId: stored.roomId,
    hostUserId: String(stored.hostUserId),
    hostName: stored.hostName,
    participants: new Map(),
    cohostIds: new Set(stored.cohostIds || []),
    locked: Boolean(stored.locked),
    chatEnabled: stored.chatEnabled !== false,
    screenShareEnabled: stored.screenShareEnabled !== false,
    createdAt,
    expiresAt: new Date(stored.expiresAt).getTime(),
    maxParticipants: MAX_CALL_PARTICIPANTS,
  };
  rooms.set(room.roomId, room);
  scheduleExpiry(room);
  return room;
};

export const createCallRoom = async (host) => {
  let roomId;
  do {
    roomId = makeRoomId();
  } while (rooms.has(roomId));

  const createdAt = Date.now();
  const record = await CallRoom.create({
    roomId,
    hostUserId: String(host._id),
    hostName: host.channelname || host.username || host.name || "Host",
    createdAt: new Date(createdAt),
    expiresAt: new Date(createdAt + ROOM_LIFETIME_MS),
    locked: false,
    chatEnabled: true,
    screenShareEnabled: true,
    cohostIds: [],
  });
  const room = {
    roomId: record.roomId,
    hostUserId: String(record.hostUserId),
    hostName: record.hostName,
    participants: new Map(),
    cohostIds: new Set(),
    locked: false,
    chatEnabled: true,
    screenShareEnabled: true,
    createdAt,
    expiresAt: createdAt + ROOM_LIFETIME_MS,
    maxParticipants: MAX_CALL_PARTICIPANTS,
  };
  rooms.set(roomId, room);
  scheduleExpiry(room);
  return room;
};

export const getCallRoom = (roomId) => rooms.get(roomId);

export const restoreCallRoom = async (roomId) => {
  if (deletingRooms.has(roomId)) return undefined;
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const stored = await CallRoom.findOne({
    roomId,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!stored || deletingRooms.has(roomId)) return undefined;
  return rooms.get(roomId) || toRuntimeRoom(stored);
};

export const persistCallRoomSettings = (room) => {
  void CallRoom.updateOne(
    { roomId: room.roomId, expiresAt: { $gt: new Date() } },
    {
      $set: {
        locked: room.locked,
        chatEnabled: room.chatEnabled,
        screenShareEnabled: room.screenShareEnabled,
        cohostIds: [...room.cohostIds],
      },
    },
  ).catch((error) => {
    console.error("Could not persist call room settings:", error.message);
  });
};

export const getPublicParticipants = (room) =>
  [...room.participants.values()].map(
    ({
      userId,
      name,
      image,
      muted,
      cameraEnabled,
      handRaised,
      screenSharing,
      connectionQuality,
      joinedAt,
      online,
      mutedByHost,
    }) => ({
      userId,
      name,
      image,
      muted,
      cameraEnabled,
      handRaised,
      screenSharing,
      connectionQuality,
      joinedAt,
      online,
      mutedByHost,
      isHost: userId === room.hostUserId,
      isCohost: room.cohostIds.has(userId),
    }),
  );

export const getCallRoomState = (room) => ({
  roomId: room.roomId,
  hostUserId: room.hostUserId,
  hostName: room.hostName,
  participants: getPublicParticipants(room),
  locked: room.locked,
  chatEnabled: room.chatEnabled,
  screenShareEnabled: room.screenShareEnabled,
  recording: Boolean(room.recording),
  maxParticipants: room.maxParticipants,
  startedAt: room.createdAt,
});

export const scheduleCallParticipantRemoval = (io, room, participant) => {
  const timerKey = `${room.roomId}:${participant.userId}`;
  const oldTimer = removeTimers.get(timerKey);
  if (oldTimer) clearTimeout(oldTimer);

  const timer = setTimeout(() => {
    removeTimers.delete(timerKey);
    if (participant.online || !rooms.has(room.roomId)) return;
    room.participants.delete(participant.userId);
    io.to(room.roomId).emit("call:participants", getPublicParticipants(room));
  }, CALL_RECONNECT_GRACE_MS);
  timer.unref?.();
  removeTimers.set(timerKey, timer);
};

export const cancelCallParticipantRemoval = (roomId, userId) => {
  const timerKey = `${roomId}:${userId}`;
  const timer = removeTimers.get(timerKey);
  if (timer) clearTimeout(timer);
  removeTimers.delete(timerKey);
};

export const deleteCallParticipant = (room, userId) => {
  const timerKey = `${room.roomId}:${userId}`;
  const timer = removeTimers.get(timerKey);
  if (timer) clearTimeout(timer);
  removeTimers.delete(timerKey);
  room.participants.delete(userId);
};

export const deleteCallRoom = async (roomId) => {
  deletingRooms.add(roomId);
  const expiryTimer = roomExpiryTimers.get(roomId);
  if (expiryTimer) clearTimeout(expiryTimer);
  roomExpiryTimers.delete(roomId);
  for (const [timerKey, timer] of removeTimers) {
    if (timerKey.startsWith(`${roomId}:`)) {
      clearTimeout(timer);
      removeTimers.delete(timerKey);
    }
  }
  rooms.delete(roomId);
  try {
    await CallRoom.deleteOne({ roomId });
    deletingRooms.delete(roomId);
  } catch (error) {
    console.error("Could not delete persisted call room:", error.message);
  }
};

export const enforceJoinRateLimit = (key) => {
  const now = Date.now();
  const attempts = joinAttempts.get(key) || [];
  const recentAttempts = attempts.filter((timestamp) => now - timestamp < 60_000);
  if (recentAttempts.length >= 12) {
    joinAttempts.set(key, recentAttempts);
    return false;
  }
  recentAttempts.push(now);
  joinAttempts.set(key, recentAttempts);
  return true;
};

const joinAttempts = new Map();

export const canModerateCall = (room, userId) =>
  room.hostUserId === userId || room.cohostIds.has(userId);
