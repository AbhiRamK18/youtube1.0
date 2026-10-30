import { randomBytes } from "node:crypto";

export const MAX_CALL_PARTICIPANTS = 4;
export const CALL_RECONNECT_GRACE_MS = 30_000;

const rooms = new Map();
const removeTimers = new Map();
const roomExpiryTimers = new Map();
const ROOM_LIFETIME_MS = 4 * 60 * 60 * 1000;

const makeRoomId = () => randomBytes(6).toString("hex").toUpperCase();

export const createCallRoom = (host) => {
  let roomId;
  do {
    roomId = makeRoomId();
  } while (rooms.has(roomId));

  const room = {
    roomId,
    hostUserId: String(host._id),
    hostName: host.channelname || host.username || host.name || "Host",
    participants: new Map(),
    cohostIds: new Set(),
    locked: false,
    chatEnabled: true,
    screenShareEnabled: true,
    createdAt: Date.now(),
    maxParticipants: MAX_CALL_PARTICIPANTS,
  };
  rooms.set(roomId, room);
  const expiryTimer = setTimeout(() => deleteCallRoom(roomId), ROOM_LIFETIME_MS);
  expiryTimer.unref?.();
  roomExpiryTimers.set(roomId, expiryTimer);
  return room;
};

export const getCallRoom = (roomId) => rooms.get(roomId);

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
    if (room.participants.size === 0) deleteCallRoom(room.roomId);
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

export const deleteCallRoom = (roomId) => {
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
