"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  CameraOff,
  Clipboard,
  Circle,
  Download,
  FileUp,
  Hand,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Shield,
  Users,
  Video,
  X,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import { auth } from "@/lib/firebase";

type Participant = {
  userId: string;
  name: string;
  image?: string;
  muted: boolean;
  cameraEnabled: boolean;
  mutedByHost: boolean;
  handRaised: boolean;
  screenSharing: boolean;
  connectionQuality: "good" | "fair" | "poor" | "unknown";
  joinedAt: number;
  online: boolean;
  isHost: boolean;
  isCohost: boolean;
};

type CallSettings = {
  locked: boolean;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  recording?: boolean;
};

type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  sentAt: number;
  attachment?: { name: string; type: string; dataUrl: string };
};

type IceServer = RTCIceServer;
type SignalMessage = {
  fromUserId: string;
  type: "offer" | "answer" | "ice-candidate";
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
};
type SecureCallPacket =
  | { kind: "text"; id: string; text: string; sentAt: number }
  | {
      kind: "file-start";
      id: string;
      name: string;
      mime: string;
      sentAt: number;
      totalChunks: number;
    }
  | { kind: "file-chunk"; id: string; index: number; chunk: string };
type PendingAttachment = {
  name: string;
  mime: string;
  sentAt: number;
  chunks: (string | undefined)[];
};

const serverUrl =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:5000";
const allowedAttachmentTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
const MAX_ATTACHMENT_SIZE = 700_000;
const MAX_RECORDING_SIZE = 250 * 1024 * 1024;
const ACTIVE_CALL_STORAGE_KEY = "active-video-call-room";

function VideoTile({
  name,
  stream,
  muted = false,
  cameraEnabled = true,
  speaking = false,
  local = false,
  onVideoElement,
}: {
  name: string;
  stream?: MediaStream;
  muted?: boolean;
  cameraEnabled?: boolean;
  speaking?: boolean;
  local?: boolean;
  onVideoElement?: (element: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) videoElement.srcObject = stream || null;
    return () => {
      if (videoElement) videoElement.srcObject = null;
    };
  }, [stream]);

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl border bg-zinc-900 ${
        speaking ? "border-emerald-400 ring-2 ring-emerald-400/50" : "border-white/10"
      }`}
    >
      {stream && cameraEnabled ? (
        <video
          ref={(element) => {
            videoRef.current = element;
            onVideoElement?.(element);
          }}
          autoPlay
          playsInline
          muted={local || muted}
          className={`h-full w-full object-cover ${local ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-2xl font-semibold">
            {name.slice(0, 1).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <span className="truncate text-sm font-medium text-white">
          {name}{local ? " (You)" : ""}
        </span>
        <span className="flex items-center gap-1 text-xs text-white">
          {muted ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
          {!cameraEnabled && <CameraOff className="h-4 w-4 text-red-400" />}
        </span>
      </div>
      {speaking && (
        <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-black">
          Speaking
        </span>
      )}
    </div>
  );
}

const getAckError = (ack: { error?: string }) => ack?.error || "";

export default function CallRoomPage() {
  const { roomId: routeRoomId } = useParams<{ roomId: string }>();
  const roomId = routeRoomId.toUpperCase();
  const router = useRouter();
  const { user } = useUser();
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingFrameRef = useRef<number | null>(null);
  const recordingCanvasStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingSourcesRef = useRef(new Map<string, MediaStreamAudioSourceNode>());
  const recordingAudioStreamsRef = useRef(new Map<string, MediaStream>());
  const recordingBytesRef = useRef(0);
  const recordingVideoElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const recordingRef = useRef(false);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>());
  const pendingAttachmentsRef = useRef(new Map<string, PendingAttachment>());
  const peerRestartTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const participantsRef = useRef<Participant[]>([]);
  const myUserIdRef = useRef("");
  const joinedOnceRef = useRef(false);
  const cleanupRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [settings, setSettings] = useState<CallSettings>({
    locked: false,
    chatEnabled: true,
    screenShareEnabled: true,
  });
  const settingsRef = useRef(settings);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [phase, setPhase] = useState<"ready" | "joining" | "joined" | "error">("ready");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [raisedHand, setRaisedHand] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chatOpen, setChatOpen] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const speakingUsersRef = useRef<Set<string>>(new Set());
  const [connectionQuality, setConnectionQuality] =
    useState<Participant["connectionQuality"]>("unknown");
  const [recording, setRecording] = useState(false);
  const [hasTurnServer, setHasTurnServer] = useState(false);
  const adaptiveQualityRef = useRef<Participant["connectionQuality"]>("unknown");
  const currentUserId = user?._id || "";
  const hasMicrophone = Boolean(localStream?.getAudioTracks().length);
  const hasCamera = cameras.length > 0;
  const me = participants.find((participant) => participant.userId === currentUserId);
  const isHost = me?.isHost || false;
  const canModerate = Boolean(me?.isHost || me?.isCohost);

  const updateParticipants = useCallback((next: Participant[]) => {
    participantsRef.current = next;
    setParticipants(next);
  }, []);

  const closePeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.close();
    for (const channel of dataChannelsRef.current.values()) channel.close();
    peersRef.current.clear();
    pendingIceRef.current.clear();
    dataChannelsRef.current.clear();
    pendingAttachmentsRef.current.clear();
    for (const timer of peerRestartTimersRef.current.values()) clearTimeout(timer);
    peerRestartTimersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const stopMedia = useCallback(() => {
    for (const track of localStreamRef.current?.getTracks() || []) track.stop();
    cameraTrackRef.current?.stop();
    screenTrackRef.current?.stop();
    localStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    setLocalStream(null);
    setSharingScreen(false);
  }, []);

  const leaveCall = useCallback(
    (notifyServer = true) => {
      cleanupRef.current = true;
      const socket = socketRef.current;
      if (recordingRef.current) {
        recordingRef.current = false;
        setRecording(false);
        socket?.emit("call:recording", { recording: false });
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }
      if (currentUserId && typeof window !== "undefined") {
        const savedRoom = window.localStorage.getItem(ACTIVE_CALL_STORAGE_KEY);
        if (savedRoom === `${currentUserId}:${roomId}`) {
          window.localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
        }
      }
      if (socket?.connected && notifyServer) {
        socket.emit(isHost ? "call:end" : "call:leave");
      }
      socket?.disconnect();
      socketRef.current = null;
      closePeers();
      stopMedia();
      setPhase("ready");
      router.push("/calls");
    },
    [closePeers, currentUserId, isHost, roomId, router, stopMedia],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const host = participantsRef.current.find((participant) => participant.isHost);
      if (host) setElapsedSeconds(Math.max(0, Math.floor((Date.now() - host.joinedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [participants]);

  useEffect(() => {
    let active = true;
    const setup = async () => {
      if (!localStream) return;
      const AudioContextConstructor =
        window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const audioContext = new AudioContextConstructor();
      const analysers = new Map<string, AnalyserNode>();
      const streams = [
        [currentUserId, localStream] as const,
        ...Object.entries(remoteStreams),
      ];
      for (const [participantId, stream] of streams) {
        if (!stream.getAudioTracks().length) continue;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        analysers.set(participantId, analyser);
      }
      const buffer = new Uint8Array(512);
      let frame = 0;
      const inspect = () => {
        if (!active) return;
        const next = new Set<string>();
        for (const [participantId, analyser] of analysers) {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const sample of buffer) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          if (Math.sqrt(sum / buffer.length) > 0.035) next.add(participantId);
        }
        const previous = speakingUsersRef.current;
        const changed =
          previous.size !== next.size ||
          [...next].some((participantId) => !previous.has(participantId));
        if (changed) {
          speakingUsersRef.current = next;
          setSpeakingUsers(next);
        }
        frame = requestAnimationFrame(inspect);
      };
      inspect();
      return () => {
        cancelAnimationFrame(frame);
        void audioContext.close();
      };
    };
    let dispose: (() => void) | undefined;
    void setup()
      .then((cleanup) => {
        dispose = cleanup;
      })
      .catch((audioError) => {
        console.error("Could not monitor speaking activity:", audioError);
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [currentUserId, localStream, remoteStreams]);

  useEffect(() => {
    if (phase !== "joined") return;
    const interval = window.setInterval(async () => {
      let maxRtt = 0;
      let maxPacketLoss = 0;
      for (const peer of peersRef.current.values()) {
        try {
          const stats = await peer.getStats();
          for (const report of stats.values()) {
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              report.currentRoundTripTime
            ) {
              maxRtt = Math.max(maxRtt, report.currentRoundTripTime);
            }
            if (
              report.type === "remote-inbound-rtp" &&
              typeof report.fractionLost === "number"
            ) {
              maxPacketLoss = Math.max(maxPacketLoss, report.fractionLost);
            }
          }
        } catch (statsError) {
          console.error("Could not read peer connection quality:", statsError);
        }
      }
      const quality: Participant["connectionQuality"] =
        peersRef.current.size === 0
          ? "unknown"
          : maxRtt > 0.4 || maxPacketLoss > 0.08
            ? "poor"
            : maxRtt > 0.2 || maxPacketLoss > 0.03
              ? "fair"
              : "good";
      setConnectionQuality(quality);
      socketRef.current?.emit("call:update", { connectionQuality: quality });
      if (quality === adaptiveQualityRef.current || quality === "unknown") return;
      adaptiveQualityRef.current = quality;
      const videoSettings = {
        good: { maxBitrate: 600_000, scale: 1.5, maxFramerate: 20 },
        fair: { maxBitrate: 320_000, scale: 2, maxFramerate: 15 },
        poor: { maxBitrate: 140_000, scale: 3, maxFramerate: 10 },
        unknown: { maxBitrate: 320_000, scale: 2, maxFramerate: 15 },
      }[quality];
      await Promise.all(
        [...peersRef.current.values()].flatMap((peer) =>
          peer.getSenders().map(async (sender) => {
            if (!sender.track) return;
            const parameters = sender.getParameters();
            if (!parameters.encodings?.length) return;
            parameters.encodings[0].maxBitrate =
              sender.track.kind === "audio" ? 64_000 : videoSettings.maxBitrate;
            if (sender.track.kind === "video") {
              parameters.encodings[0].scaleResolutionDownBy = videoSettings.scale;
              parameters.encodings[0].maxFramerate = videoSettings.maxFramerate;
              parameters.degradationPreference = "maintain-framerate";
            }
            try {
              await sender.setParameters(parameters);
            } catch (parameterError) {
              console.error("Could not adapt video quality:", parameterError);
            }
          }),
        ),
      );
    }, 5000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(
    () => () => {
      const socket = socketRef.current;
      if (recordingRef.current) {
        recordingRef.current = false;
        socket?.emit("call:recording", { recording: false });
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }
      socket?.disconnect();
      closePeers();
      stopMedia();
    },
    [closePeers, stopMedia],
  );

  const joinCall = async () => {
    if (!user || !auth.currentUser) {
      setError("Sign in on a trusted device before joining a call.");
      return;
    }
    if (!/^[A-F0-9]{12}$/.test(roomId)) {
      setError("This meeting code is invalid.");
      return;
    }

    setError("");
    setPhase("joining");
    cleanupRef.current = false;
    socketRef.current?.disconnect();
    socketRef.current = null;
    closePeers();
    stopMedia();
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (initialMediaError) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          toast.message("Camera unavailable or denied. Joining with microphone only.");
        } catch (audioError) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { facingMode: "user" },
            });
            toast.message("Microphone unavailable or denied. Joining with camera only.");
          } catch {
            throw initialMediaError || audioError;
          }
        }
      }
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      const audioTracks = stream.getAudioTracks();
      const initiallyMuted =
        audioTracks.length === 0 || audioTracks.every((track) => !track.enabled);
      setMuted(initiallyMuted);
      setCameraEnabled(Boolean(cameraTrackRef.current));
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((device) => device.kind === "videoinput"));
      const token = await auth.currentUser.getIdToken();
      const socket = io(serverUrl, {
        auth: { token },
        withCredentials: true,
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
      });
      socketRef.current = socket;
      socket.on("call:ice-config", (config: { iceServers?: RTCIceServer[] }) => {
        if (config.iceServers?.length) {
          iceServersRef.current = config.iceServers;
          setHasTurnServer(
            config.iceServers.some((server) =>
              (Array.isArray(server.urls) ? server.urls : [server.urls]).some(
                (url) =>
                  typeof url === "string" &&
                  (url.startsWith("turn:") || url.startsWith("turns:")),
              ),
            ),
          );
        }
      });

      const emitSignal = (targetUserId: string, type: SignalMessage["type"], signal: unknown) =>
        socket.emit("peer:signal", { targetUserId, type, signal });

      const configureDataChannel = (
        peerUserId: string,
        channel: RTCDataChannel,
      ) => {
        dataChannelsRef.current.set(peerUserId, channel);
        channel.onmessage = (event) => {
          if (!settingsRef.current.chatEnabled || typeof event.data !== "string") return;
          let packet: SecureCallPacket;
          try {
            packet = JSON.parse(event.data) as SecureCallPacket;
          } catch {
            return;
          }
          const sender = participantsRef.current.find(
            (participant) => participant.userId === peerUserId,
          );
          const senderName = sender?.name || "Participant";
          if (
            packet.kind === "text" &&
            typeof packet.id === "string" &&
            typeof packet.text === "string" &&
            packet.text.length <= 2_000 &&
            typeof packet.sentAt === "number"
          ) {
            setMessages((current) =>
              current.some((message) => message.id === packet.id)
                ? current
                : [
                    ...current.slice(-99),
                    {
                      id: packet.id,
                      userId: peerUserId,
                      name: senderName,
                      text: packet.text,
                      sentAt: packet.sentAt,
                    },
                  ],
            );
            return;
          }
          if (
            packet.kind === "file-start" &&
            typeof packet.id === "string" &&
            typeof packet.name === "string" &&
            allowedAttachmentTypes.has(packet.mime) &&
            typeof packet.sentAt === "number" &&
            Number.isInteger(packet.totalChunks) &&
            packet.totalChunks > 0 &&
            packet.totalChunks <= 100
          ) {
            pendingAttachmentsRef.current.set(`${peerUserId}:${packet.id}`, {
              name: packet.name.slice(0, 140),
              mime: packet.mime,
              sentAt: packet.sentAt,
              chunks: Array(packet.totalChunks).fill(undefined),
            });
            return;
          }
          if (
            packet.kind === "file-chunk" &&
            typeof packet.id === "string" &&
            Number.isInteger(packet.index) &&
            typeof packet.chunk === "string" &&
            packet.chunk.length <= 16_000
          ) {
            const attachmentKey = `${peerUserId}:${packet.id}`;
            const pending = pendingAttachmentsRef.current.get(attachmentKey);
            if (!pending || packet.index < 0 || packet.index >= pending.chunks.length) {
              return;
            }
            pending.chunks[packet.index] = packet.chunk;
            if (
              pending.chunks.reduce(
                (total, chunk) => total + (chunk?.length || 0),
                0,
              ) > 1_000_000
            ) {
              pendingAttachmentsRef.current.delete(attachmentKey);
              return;
            }
            if (pending.chunks.every((chunk) => chunk !== undefined)) {
              const dataUrl = pending.chunks.join("");
              pendingAttachmentsRef.current.delete(attachmentKey);
              if (
                dataUrl.length > 1_000_000 ||
                !dataUrl.startsWith(`data:${pending.mime};base64,`)
              ) return;
              setMessages((current) =>
                current.some((message) => message.id === packet.id)
                  ? current
                  : [
                      ...current.slice(-99),
                      {
                        id: packet.id,
                        userId: peerUserId,
                        name: senderName,
                        text: "",
                        sentAt: pending.sentAt,
                        attachment: {
                          name: pending.name,
                          type: pending.mime,
                          dataUrl,
                        },
                      },
                    ],
              );
            }
          }
        };
        channel.onclose = () => {
          if (dataChannelsRef.current.get(peerUserId) === channel) {
            dataChannelsRef.current.delete(peerUserId);
          }
        };
      };

      let renegotiatePeer: ((peerUserId: string) => void) | null = null;
      const createPeer = (peerUserId: string, initiator = false) => {
        const existing = peersRef.current.get(peerUserId);
        if (existing) {
          if (initiator && !dataChannelsRef.current.has(peerUserId)) {
            configureDataChannel(peerUserId, existing.createDataChannel("call-chat"));
          }
          return existing;
        }
        const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
        peer.ondatachannel = (event) =>
          configureDataChannel(peerUserId, event.channel);
        if (initiator) {
          configureDataChannel(peerUserId, peer.createDataChannel("call-chat"));
        }
        const activeStream = localStreamRef.current;
        let hasVideoTrack = false;
        if (activeStream) {
          for (const track of activeStream.getTracks()) {
            if (track.kind === "video") hasVideoTrack = true;
            const sender = peer.addTrack(track, activeStream);
            const parameters = sender.getParameters();
            parameters.encodings = parameters.encodings?.length
              ? parameters.encodings
              : [{}];
            if (track.kind === "video") {
              parameters.encodings[0].maxBitrate = 600_000;
              parameters.encodings[0].maxFramerate = 20;
              parameters.encodings[0].scaleResolutionDownBy = 1.5;
              parameters.degradationPreference = "balanced";
            } else {
              parameters.encodings[0].maxBitrate = 64_000;
            }
            void sender.setParameters(parameters).catch((parameterError) => {
              console.error("Could not apply call bandwidth preferences:", parameterError);
            });
          }
        }
        if (!hasVideoTrack) {
          peer.addTransceiver("video", { direction: "sendrecv" });
        }
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            emitSignal(peerUserId, "ice-candidate", event.candidate.toJSON());
          }
        };
        peer.ontrack = (event) => {
          const remoteStream =
            event.streams[0] ||
            remoteStreamsRef.current.get(peerUserId) ||
            new MediaStream();
          if (!event.streams[0]) remoteStream.addTrack(event.track);
          remoteStreamsRef.current.set(peerUserId, remoteStream);
          setRemoteStreams((current) => ({ ...current, [peerUserId]: remoteStream }));
        };
        peer.onconnectionstatechange = () => {
          const restartKey = peerUserId;
          if (peer.connectionState === "connected") {
            const restartTimer = peerRestartTimersRef.current.get(restartKey);
            if (restartTimer) clearTimeout(restartTimer);
            peerRestartTimersRef.current.delete(restartKey);
            setError("");
            return;
          }
          if (peer.connectionState === "disconnected" || peer.connectionState === "failed") {
            if (peerRestartTimersRef.current.has(restartKey)) return;
            const restartTimer = setTimeout(() => {
              peerRestartTimersRef.current.delete(restartKey);
              if (peersRef.current.get(peerUserId) !== peer) return;
              if (!["disconnected", "failed"].includes(peer.connectionState)) return;
              if (myUserIdRef.current.localeCompare(peerUserId) >= 0) return;
              peer.close();
              peersRef.current.delete(peerUserId);
              remoteStreamsRef.current.delete(peerUserId);
              setRemoteStreams((current) => {
                const next = { ...current };
                delete next[peerUserId];
                return next;
              });
              renegotiatePeer?.(peerUserId);
            }, peer.connectionState === "failed" ? 0 : 4_000);
            peerRestartTimersRef.current.set(restartKey, restartTimer);
            return;
          }
          if (peer.connectionState === "closed") {
            peer.close();
            peersRef.current.delete(peerUserId);
            remoteStreamsRef.current.delete(peerUserId);
            setRemoteStreams((current) => {
              const next = { ...current };
              delete next[peerUserId];
              return next;
            });
          }
        };
        peersRef.current.set(peerUserId, peer);
        return peer;
      };

      const connectToPeer = async (peerUserId: string) => {
        const peer = createPeer(peerUserId, true);
        if (peer.signalingState !== "stable") return;
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          emitSignal(peerUserId, "offer", offer);
        } catch (peerError) {
          console.error("Could not start peer connection:", peerError);
        }
      };
      renegotiatePeer = (peerUserId) => {
        const peer = createPeer(peerUserId, true);
        if (!peer || peer.signalingState !== "stable") return;
        void (async () => {
          try {
            const offer = await peer.createOffer({ iceRestart: true });
            await peer.setLocalDescription(offer);
            emitSignal(peerUserId, "offer", offer);
          } catch (peerError) {
            console.error("Could not restart a peer connection:", peerError);
          }
        })();
      };

      socket.on("connect", () => {
        socket.emit("call:join", { roomId }, (ack: {
          error?: string;
          state?: { participants: Participant[]; startedAt: number; [key: string]: unknown };
          userId?: string;
          iceServers?: IceServer[];
        }) => {
          const ackError = getAckError(ack);
          if (ackError || !ack.state) {
            setError(ackError || "Could not join this meeting.");
            setPhase("error");
            stopMedia();
            socket.disconnect();
            return;
          }
          myUserIdRef.current = ack.userId || currentUserId;
          if (ack.iceServers?.length) iceServersRef.current = ack.iceServers;
          window.localStorage.setItem(
            ACTIVE_CALL_STORAGE_KEY,
            `${currentUserId}:${roomId}`,
          );
          joinedOnceRef.current = true;
          setError("");
          updateParticipants(ack.state.participants);
          const nextSettings = {
            locked: Boolean(ack.state.locked),
            chatEnabled: Boolean(ack.state.chatEnabled),
            screenShareEnabled: Boolean(ack.state.screenShareEnabled),
            recording: Boolean(ack.state.recording),
          };
          setRecording(nextSettings.recording);
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - ack.state.startedAt) / 1000)));
          setPhase("joined");
          socket.emit("call:update", {
            muted: initiallyMuted,
            cameraEnabled: Boolean(cameraTrackRef.current),
          });
          for (const participant of ack.state.participants) {
            if (participant.userId !== (ack.userId || currentUserId) && participant.online) {
              createPeer(participant.userId);
            }
          }
        });
      });
      socket.on("connect_error", (socketError) => {
        console.error("Video call connection failed:", socketError);
        setError(socketError.message || "Could not connect to the call server.");
        if (!joinedOnceRef.current) setPhase("error");
      });
      socket.on("disconnect", () => {
        if (recordingRef.current) {
          recordingRef.current = false;
          setRecording(false);
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        }
        closePeers();
        setConnectionQuality("unknown");
        if (!cleanupRef.current) setError("Connection lost. Reconnecting…");
      });
      socket.on("call:participants", updateParticipants);
      socket.on("call:settings", (next: CallSettings) => {
        settingsRef.current = next;
        setSettings(next);
        setRecording(Boolean(next.recording));
      });
      socket.on("call:recording", ({ recording: nextRecording }: { recording: boolean }) => {
        setRecording(nextRecording);
        settingsRef.current = { ...settingsRef.current, recording: nextRecording };
        setSettings((current) => ({ ...current, recording: nextRecording }));
        if (nextRecording && myUserIdRef.current !== participantsRef.current.find((participant) => participant.isHost)?.userId) {
          toast.message("The host has started recording this meeting.");
        }
      });
      socket.on("call:participant-joined", ({ userId }: { userId: string }) => {
        if (userId !== myUserIdRef.current) void connectToPeer(userId);
      });
      socket.on("call:participant-offline", ({ userId }: { userId: string }) => {
        peersRef.current.get(userId)?.close();
        peersRef.current.delete(userId);
        remoteStreamsRef.current.delete(userId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      });
      socket.on("peer:signal", async ({ fromUserId, type, signal }: SignalMessage) => {
        const peer = createPeer(fromUserId);
        try {
          if (type === "offer") {
            await peer.setRemoteDescription(signal as RTCSessionDescriptionInit);
            for (const candidate of pendingIceRef.current.get(fromUserId) || []) {
              await peer.addIceCandidate(candidate);
            }
            pendingIceRef.current.delete(fromUserId);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            emitSignal(fromUserId, "answer", answer);
          } else if (type === "answer") {
            await peer.setRemoteDescription(signal as RTCSessionDescriptionInit);
            for (const candidate of pendingIceRef.current.get(fromUserId) || []) {
              await peer.addIceCandidate(candidate);
            }
            pendingIceRef.current.delete(fromUserId);
          } else {
            const candidate = signal as RTCIceCandidateInit;
            if (peer.remoteDescription) {
              await peer.addIceCandidate(candidate);
            } else {
              const pending = pendingIceRef.current.get(fromUserId) || [];
              pending.push(candidate);
              pendingIceRef.current.set(fromUserId, pending);
            }
          }
        } catch (peerError) {
          console.error("Could not negotiate a peer connection:", peerError);
        }
      });
      socket.on("call:force-mute", () => {
        for (const track of localStreamRef.current?.getAudioTracks() || []) track.enabled = false;
        setMuted(true);
        socket.emit("call:update", { muted: true });
        toast.message("The host muted your microphone.");
      });
      socket.on("call:allow-unmute", () => {
        toast.message("The host has allowed you to unmute.");
      });
      socket.on("call:stop-screen-share", () => void stopScreenShare());
      socket.on("call:removed", ({ reason }: { reason: string }) => {
        setError(reason || "You were removed from the meeting.");
        setPhase("error");
        leaveCall(false);
        router.push("/calls");
      });
      socket.on("call:ended", () => {
        recordingRef.current = false;
        setRecording(false);
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        setError("The host ended the meeting.");
        setPhase("error");
        leaveCall(false);
        router.push("/calls");
      });
      socket.connect();
    } catch (mediaError) {
      console.error("Could not access call devices:", mediaError);
      setError(
        mediaError instanceof DOMException && mediaError.name === "NotAllowedError"
            ? "Allow microphone access in your browser, then try again."
          : "Could not start your camera and microphone. Check your devices and try again.",
      );
      setPhase("error");
      stopMedia();
    }
  };

  const toggleMicrophone = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    if (!audioTracks.length) {
      toast.error("No microphone is available for this call.");
      return;
    }
    if (me?.mutedByHost && muted) {
      toast.error("The host has muted your microphone. Ask them to allow you to unmute.");
      return;
    }
    const nextMuted = audioTracks.some((track) => track.enabled);
    for (const track of audioTracks) {
      track.enabled = !nextMuted;
    }
    setMuted(nextMuted);
    socketRef.current?.emit("call:update", { muted: nextMuted });
  };

  const toggleCamera = () => {
    if (!hasCamera) {
      toast.error("No camera is available for this call.");
      return;
    }
    if (sharingScreen) {
      toast.message("Stop screen sharing before changing camera status.");
      return;
    }
    const nextEnabled = !cameraEnabled;
    for (const track of localStreamRef.current?.getVideoTracks() || []) {
      track.enabled = nextEnabled;
    }
    setCameraEnabled(nextEnabled);
    socketRef.current?.emit("call:update", { cameraEnabled: nextEnabled });
  };

  const replaceVideoTrack = async (nextTrack: MediaStreamTrack) => {
    const oldTracks = localStreamRef.current?.getVideoTracks() || [];
    for (const peer of peersRef.current.values()) {
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(nextTrack);
    }
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of oldTracks) stream.removeTrack(track);
      stream.addTrack(nextTrack);
      setLocalStream(new MediaStream(stream.getTracks()));
    }
    for (const peer of peersRef.current.values()) {
      const sender =
        peer.getSenders().find((item) => item.track?.kind === "video") ||
        peer
          .getTransceivers()
          .find((transceiver) => transceiver.receiver.track.kind === "video")
          ?.sender;
      if (sender && !sender.track) await sender.replaceTrack(nextTrack);
    }
  };

  const stopScreenShare = useCallback(async () => {
    const screenTrack = screenTrackRef.current;
    if (!screenTrack) return;
    screenTrack.onended = null;
    screenTrack.stop();
    screenTrackRef.current = null;
    const cameraTrack = cameraTrackRef.current;
    if (cameraTrack) await replaceVideoTrack(cameraTrack);
    setSharingScreen(false);
    socketRef.current?.emit("call:update", { screenSharing: false });
  }, []);

  const stopRecording = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    socketRef.current?.emit("call:recording", { recording: false });
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = () => {
    if (!isHost || recordingRef.current) return;
    if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) {
      toast.error("Meeting recording is not supported by this browser.");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create the recording canvas.");
      const canvasStream = canvas.captureStream(20);
      recordingCanvasStreamRef.current = canvasStream;
      recordingChunksRef.current = [];

      const audioContext = new AudioContext();
      const audioDestination = audioContext.createMediaStreamDestination();
      recordingAudioContextRef.current = audioContext;
      recordingAudioDestinationRef.current = audioDestination;

      const drawFrame = () => {
        const tiles = [
          {
            id: currentUserId,
            name: user?.channelname || user?.username || user?.name || "Host",
            stream: localStreamRef.current,
          },
          ...participantsRef.current
            .filter((participant) => participant.userId !== currentUserId)
            .map((participant) => ({
              id: participant.userId,
              name: participant.name,
              stream: remoteStreamsRef.current.get(participant.userId),
            })),
        ].slice(0, 4);
        const columns = tiles.length > 1 ? 2 : 1;
        const rows = Math.ceil(tiles.length / columns);
        const tileWidth = canvas.width / columns;
        const tileHeight = canvas.height / rows;
        context.fillStyle = "#09090b";
        context.fillRect(0, 0, canvas.width, canvas.height);
        tiles.forEach((tile, index) => {
          const x = (index % columns) * tileWidth;
          const y = Math.floor(index / columns) * tileHeight;
          const video = recordingVideoElementsRef.current.get(tile.id);
          if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              context.drawImage(video, x, y, tileWidth, tileHeight);
            } catch (drawError) {
              console.error("Could not draw a meeting recording frame:", drawError);
            }
          } else {
            context.fillStyle = "#27272a";
            context.fillRect(x, y, tileWidth, tileHeight);
            context.fillStyle = "#ffffff";
            context.font = "bold 48px sans-serif";
            context.textAlign = "center";
            context.fillText(tile.name.slice(0, 1).toUpperCase(), x + tileWidth / 2, y + tileHeight / 2);
          }
          context.fillStyle = "rgba(0, 0, 0, 0.65)";
          context.fillRect(x, y + tileHeight - 42, tileWidth, 42);
          context.fillStyle = "#ffffff";
          context.font = "20px sans-serif";
          context.textAlign = "left";
          context.fillText(tile.name.slice(0, 50), x + 16, y + tileHeight - 14);
        });
        recordingFrameRef.current = window.requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const streams: [string, MediaStream | null][] = [
        ["local", localStreamRef.current],
      ];
      for (const [participantId, stream] of remoteStreamsRef.current) {
        streams.push([participantId, stream]);
      }
      for (const [participantId, stream] of streams) {
        if (!stream?.getAudioTracks().length) continue;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(audioDestination);
        recordingSourcesRef.current.set(participantId, source);
        recordingAudioStreamsRef.current.set(participantId, stream);
      }

      const recordingStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const mimeType = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(
        recordingStream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        recordingBytesRef.current += event.data.size;
        recordingChunksRef.current.push(event.data);
        if (recordingBytesRef.current > MAX_RECORDING_SIZE) {
          toast.error("Recording reached the 250 MB limit and was stopped.");
          stopRecording();
        }
      };
      recorder.onerror = (event) => {
        console.error("Meeting recorder reported an error:", event);
        toast.error("Recording stopped because the browser reported an error.");
        stopRecording();
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        recordingChunksRef.current = [];
        recordingBytesRef.current = 0;
        if (blob.size) {
          const downloadUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = downloadUrl;
          const extension = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
          anchor.download = `meeting-${roomId}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
          toast.success("Meeting recording saved to your downloads.");
        }
        if (recordingFrameRef.current !== null) {
          window.cancelAnimationFrame(recordingFrameRef.current);
          recordingFrameRef.current = null;
        }
        recordingCanvasStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingCanvasStreamRef.current = null;
        recordingAudioDestinationRef.current?.stream
          .getTracks()
          .forEach((track) => track.stop());
        for (const source of recordingSourcesRef.current.values()) source.disconnect();
        recordingSourcesRef.current.clear();
        recordingAudioStreamsRef.current.clear();
        recordingAudioDestinationRef.current = null;
        void recordingAudioContextRef.current?.close();
        recordingAudioContextRef.current = null;
        recorderRef.current = null;
      };
      recorder.start(1000);
      recordingRef.current = true;
      setRecording(true);
      socketRef.current?.emit("call:recording", { recording: true });
    } catch (recordingError) {
      console.error("Could not start meeting recording:", recordingError);
      toast.error("Could not start recording. Check browser permissions and available storage.");
      recordingCanvasStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingCanvasStreamRef.current = null;
      if (recordingFrameRef.current !== null) {
        window.cancelAnimationFrame(recordingFrameRef.current);
        recordingFrameRef.current = null;
      }
      for (const source of recordingSourcesRef.current.values()) source.disconnect();
      recordingSourcesRef.current.clear();
      recordingAudioStreamsRef.current.clear();
      recordingAudioDestinationRef.current = null;
      void recordingAudioContextRef.current?.close();
      recordingAudioContextRef.current = null;
      recorderRef.current = null;
      recordingChunksRef.current = [];
      recordingBytesRef.current = 0;
    }
  };

  useEffect(() => {
    const audioContext = recordingAudioContextRef.current;
    const destination = recordingAudioDestinationRef.current;
    if (!recording || !audioContext || !destination) return;
    const streams: [string, MediaStream | null][] = [
      ["local", localStream],
      ...Object.entries(remoteStreams),
    ];
    const activeStreamIds = new Set(
      streams.filter((entry) => entry[1]).map(([participantId]) => participantId),
    );
    for (const [participantId, source] of recordingSourcesRef.current) {
      if (!activeStreamIds.has(participantId)) {
        source.disconnect();
        recordingSourcesRef.current.delete(participantId);
        recordingAudioStreamsRef.current.delete(participantId);
      }
    }
    for (const [participantId, stream] of streams) {
      if (!stream) continue;
      if (!stream.getAudioTracks().length) {
        recordingSourcesRef.current.get(participantId)?.disconnect();
        recordingSourcesRef.current.delete(participantId);
        recordingAudioStreamsRef.current.delete(participantId);
        continue;
      }
      try {
        if (recordingAudioStreamsRef.current.get(participantId) === stream) continue;
        recordingSourcesRef.current.get(participantId)?.disconnect();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
        recordingSourcesRef.current.set(participantId, source);
        recordingAudioStreamsRef.current.set(participantId, stream);
      } catch (recordingError) {
        console.error("Could not add participant audio to recording:", recordingError);
      }
    }
  }, [localStream, recording, remoteStreams]);

  const startScreenShare = async () => {
    if (!settings.screenShareEnabled) {
      toast.error("The host has disabled screen sharing.");
      return;
    }
    if (!navigator.mediaDevices.getDisplayMedia) {
      toast.error("Screen sharing is not available in this browser.");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = displayStream.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      await replaceVideoTrack(track);
      setSharingScreen(true);
      socketRef.current?.emit("call:update", { screenSharing: true });
      track.onended = () => void stopScreenShare();
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "NotAllowedError") {
        toast.message("Screen sharing was denied or cancelled. Allow it in your browser and try again.");
        return;
      }
      console.error("Could not share screen:", shareError);
      toast.error("Screen sharing was cancelled or could not start.");
    }
  };

  const switchCamera = async (event: ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    if (!deviceId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.enabled = cameraEnabled;
      cameraTrackRef.current?.stop();
      cameraTrackRef.current = track;
      if (sharingScreen) {
        setCameraEnabled(true);
        toast.message("Camera changed; stop screen sharing to show the camera.");
      } else {
        await replaceVideoTrack(track);
      }
      const nextDevices = await navigator.mediaDevices.enumerateDevices();
      setCameras(nextDevices.filter((device) => device.kind === "videoinput"));
    } catch (deviceError) {
      console.error("Could not switch camera:", deviceError);
      toast.error("Could not switch to that camera.");
    }
  };

  const toggleHand = () => {
    const nextRaised = !raisedHand;
    setRaisedHand(nextRaised);
    socketRef.current?.emit("call:update", { handRaised: nextRaised });
  };

  const broadcastSecurePacket = (packet: SecureCallPacket) => {
    const serialized = JSON.stringify(packet);
    for (const [peerUserId, channel] of dataChannelsRef.current) {
      if (channel.readyState !== "open") continue;
      try {
        channel.send(serialized);
      } catch (sendError) {
        console.error(`Could not send encrypted peer chat to ${peerUserId}:`, sendError);
      }
    }
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !settings.chatEnabled) return;
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      userId: currentUserId,
      name: user?.channelname || user?.username || user?.name || "You",
      text,
      sentAt: Date.now(),
    };
    broadcastSecurePacket({
      kind: "text",
      id: message.id,
      text,
      sentAt: message.sentAt,
    });
    setMessages((current) => [...current.slice(-99), message]);
    setMessageText("");
  };

  const shareFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!settings.chatEnabled) {
      toast.error("The host has disabled chat.");
      return;
    }
    if (!allowedAttachmentTypes.has(file.type) || file.size > MAX_ATTACHMENT_SIZE) {
      toast.error("Share an image, PDF, or text file no larger than 700 KB.");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read attachment"));
        reader.readAsDataURL(file);
      });
      const id = crypto.randomUUID();
      const sentAt = Date.now();
      const chunkSize = 12_000;
      const chunks = Array.from(
        { length: Math.ceil(dataUrl.length / chunkSize) },
        (_, index) => dataUrl.slice(index * chunkSize, (index + 1) * chunkSize),
      );
      broadcastSecurePacket({
        kind: "file-start",
        id,
        name: file.name.slice(0, 140),
        mime: file.type,
        sentAt,
        totalChunks: chunks.length,
      });
      chunks.forEach((chunk, index) =>
        broadcastSecurePacket({ kind: "file-chunk", id, index, chunk }),
      );
      setMessages((current) => [
        ...current.slice(-99),
        {
          id,
          userId: currentUserId,
          name: user?.channelname || user?.username || user?.name || "You",
          text: "",
          sentAt,
          attachment: { name: file.name, type: file.type, dataUrl },
        },
      ]);
    } catch (fileError) {
      console.error("Could not share file:", fileError);
      toast.error("Could not read the file.");
    }
  };

  const moderate = (action: string, targetUserId: string, value?: boolean) =>
    socketRef.current?.emit("call:moderate", { action, targetUserId, value });

  const formatDuration = (seconds: number) =>
    `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Meeting link copied.");
    } catch (copyError) {
      console.error("Could not copy meeting link:", copyError);
      toast.error("Could not copy the meeting link.");
    }
  };

  if (!user) {
    return (
      <main className="flex-1 p-6">
        <p>Sign in on a trusted device to join video calls.</p>
      </main>
    );
  }

  if (phase !== "joined") {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-2xl border bg-card p-7">
          <div className="flex items-center gap-3">
            <Video className="h-7 w-7" />
            <div>
              <h1 className="text-xl font-semibold">
                {phase === "joining" ? "Joining meeting…" : "Join meeting"}
              </h1>
              <p className="font-mono text-sm text-muted-foreground">{roomId}</p>
            </div>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          {phase !== "joining" && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void joinCall()}
                className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground"
              >
                {phase === "error" ? "Try again" : "Join with camera and mic"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/calls")}
                className="rounded-lg border px-5 py-3 font-medium"
              >
                Back
              </button>
            </div>
          )}
          <p className="mt-5 text-xs text-muted-foreground">
            Your browser will ask for camera and microphone permission. Calls use
            encrypted WebRTC transport. Rooms support up to four participants.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-w-0 flex-1 bg-zinc-950 p-3 text-white sm:p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Video meeting</h1>
          <p className="text-xs text-zinc-400">
            {roomId} · {formatDuration(elapsedSeconds)} · Connection {connectionQuality}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void copyRoomLink()} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
            <Clipboard className="h-4 w-4" /> Copy link
          </button>
          {canModerate && (
            <button
              type="button"
              onClick={() => socketRef.current?.emit("call:lock", { locked: !settings.locked })}
              className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
            >
              {settings.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {settings.locked ? "Unlock" : "Lock"}
            </button>
          )}
          <button type="button" onClick={() => setChatOpen((open) => !open)} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
            <Users className="h-4 w-4" /> {participants.length}
          </button>
        </div>
      </header>

      {error && (
        <p role="status" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
          {error}
        </p>
      )}
      {!hasTurnServer && (
        <p role="status" className="mb-4 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-100">
          No TURN relay is configured. Calls may not connect on restrictive networks.
        </p>
      )}
      {recording && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm text-red-100">
          <Circle className="h-3 w-3 fill-current" /> This meeting is being recorded locally by the host.
        </p>
      )}

      <div className={`grid gap-4 ${chatOpen ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}>
        <section>
          <div className="grid gap-3 sm:grid-cols-2">
            <VideoTile
              name={user.channelname || user.username || user.name || "You"}
              stream={localStream || undefined}
              muted={muted}
              cameraEnabled={cameraEnabled || sharingScreen}
              speaking={speakingUsers.has(currentUserId)}
              local
              onVideoElement={(element) => {
                if (element) recordingVideoElementsRef.current.set(currentUserId, element);
                else recordingVideoElementsRef.current.delete(currentUserId);
              }}
            />
            {participants
              .filter((participant) => participant.userId !== currentUserId)
              .map((participant) => (
                <VideoTile
                  key={participant.userId}
                  name={participant.name}
                  stream={remoteStreams[participant.userId]}
                  muted={participant.muted}
                  cameraEnabled={participant.cameraEnabled || participant.screenSharing}
                  speaking={speakingUsers.has(participant.userId)}
                  onVideoElement={(element) => {
                    if (element) {
                      recordingVideoElementsRef.current.set(participant.userId, element);
                    } else {
                      recordingVideoElementsRef.current.delete(participant.userId);
                    }
                  }}
                />
              ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={toggleMicrophone} disabled={!hasMicrophone} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={`rounded-full p-3 ${muted ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"} disabled:cursor-not-allowed disabled:opacity-40`}>
              {muted ? <MicOff /> : <Mic />}
            </button>
            <button type="button" onClick={toggleCamera} disabled={!hasCamera || sharingScreen} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} className={`rounded-full p-3 ${!cameraEnabled ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"} disabled:cursor-not-allowed disabled:opacity-40`}>
              {cameraEnabled ? <Camera /> : <CameraOff />}
            </button>
            <button type="button" disabled={!settings.screenShareEnabled} onClick={() => void (sharingScreen ? stopScreenShare() : startScreenShare())} aria-label="Share screen" className="rounded-full bg-zinc-800 p-3 hover:bg-zinc-700 disabled:opacity-40">
              <MonitorUp />
            </button>
            <button type="button" onClick={toggleHand} aria-label="Raise hand" className={`rounded-full p-3 ${raisedHand ? "bg-amber-500 text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}>
              <Hand />
            </button>
            {cameras.length > 1 && (
              <select aria-label="Switch camera" onChange={(event) => void switchCamera(event)} defaultValue="" className="max-w-40 rounded-full bg-zinc-800 px-3 py-3 text-xs">
                <option value="" disabled>Switch camera</option>
                {cameras.map((camera, index) => (
                  <option value={camera.deviceId} key={camera.deviceId}>
                    {camera.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => leaveCall()} aria-label={isHost ? "End meeting" : "Leave meeting"} className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 font-medium hover:bg-red-500">
              <PhoneOff className="h-5 w-5" /> {isHost ? "End" : "Leave"}
            </button>
          </div>

          {canModerate && (
            <section className="mt-5 rounded-xl border border-white/10 bg-zinc-900 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4" /> Host controls</h2>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.chatEnabled} disabled={!isHost} onChange={(event) => socketRef.current?.emit("call:permissions", { chatEnabled: event.target.checked })} />
                  Allow chat
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.screenShareEnabled} disabled={!isHost} onChange={(event) => socketRef.current?.emit("call:permissions", { screenShareEnabled: event.target.checked })} />
                  Allow screen sharing
                </label>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => recording ? stopRecording() : startRecording()}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      recording
                        ? "border-red-500/60 bg-red-500/15 text-red-200"
                        : "border-white/15 hover:bg-white/10"
                    }`}
                  >
                    {recording ? <Download className="h-4 w-4" /> : <Circle className="h-4 w-4 text-red-400" />}
                    {recording ? "Stop and save recording" : "Record meeting"}
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                Recordings are mixed in this browser and downloaded to the host when stopped. Participants are notified while recording; no recording is uploaded to the server.
              </p>
            </section>
          )}

          <section className="mt-5 rounded-xl border border-white/10 bg-zinc-900 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Participants</h2>
            <ul className="space-y-2">
              {participants.map((participant) => (
                <li key={participant.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{participant.name}{participant.userId === currentUserId ? " (You)" : ""}</span>
                    {participant.isHost && <span className="rounded bg-indigo-400/20 px-2 py-0.5 text-xs text-indigo-200">Host</span>}
                    {!participant.isHost && participant.isCohost && <span className="rounded bg-indigo-400/20 px-2 py-0.5 text-xs text-indigo-200">Co-host</span>}
                    {participant.handRaised && <Hand className="h-4 w-4 text-amber-400" />}
                    <span className="text-xs text-zinc-400">
                      {participant.online ? participant.connectionQuality : "Reconnecting"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {participant.muted ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
                    {participant.cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4 text-red-400" />}
                    {canModerate && participant.userId !== currentUserId && !participant.isHost && (
                      <>
                        <button type="button" onClick={() => moderate("mute", participant.userId)} title="Mute participant" className="ml-1 rounded border border-white/15 px-2 py-1 text-xs">Mute</button>
                        {participant.mutedByHost && (
                          <button type="button" onClick={() => moderate("allow-unmute", participant.userId)} title="Allow participant to unmute" className="rounded border border-white/15 px-2 py-1 text-xs">Allow unmute</button>
                        )}
                        {isHost && (
                          <button type="button" onClick={() => moderate("cohost", participant.userId, !participant.isCohost)} title="Toggle co-host" className="rounded border border-white/15 px-2 py-1 text-xs">{participant.isCohost ? "Remove co-host" : "Make co-host"}</button>
                        )}
                        <button type="button" onClick={() => moderate("remove", participant.userId)} title="Remove participant" className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300">Remove</button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </section>

        {chatOpen && (
          <aside className="flex min-h-[420px] flex-col rounded-xl border border-white/10 bg-zinc-900">
            <header className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 className="font-semibold">In-call chat</h2>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => (
                <article key={message.id} className="break-words text-sm">
                  <p className="text-xs text-zinc-400">{message.name} · {new Date(message.sentAt).toLocaleTimeString()}</p>
                  {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                  {message.attachment && (
                    <a href={message.attachment.dataUrl} download={message.attachment.name} className="mt-1 inline-flex items-center gap-2 text-sky-300 underline">
                      <FileUp className="h-4 w-4" /> {message.attachment.name}
                    </a>
                  )}
                </article>
              ))}
              {!messages.length && <p className="text-sm text-zinc-400">Messages and files shared here are only kept during this meeting.</p>}
            </div>
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex gap-1">
                {["🙂", "👍", "🎉", "❤️"].map((emoji) => (
                  <button key={emoji} type="button" disabled={!settings.chatEnabled} onClick={() => setMessageText((value) => `${value}${emoji}`)} className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40">{emoji}</button>
                ))}
                <label className="ml-auto cursor-pointer rounded px-2 py-1 hover:bg-white/10" title="Share a small image, PDF, or text file">
                  <FileUp className="h-5 w-5" />
                  <input type="file" className="hidden" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" disabled={!settings.chatEnabled} onChange={(event) => void shareFile(event)} />
                </label>
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} disabled={!settings.chatEnabled} maxLength={2000} placeholder={settings.chatEnabled ? "Send a message" : "Chat disabled by host"} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" />
                <button type="submit" disabled={!settings.chatEnabled || !messageText.trim()} aria-label="Send message" className="rounded-lg bg-indigo-500 p-2 disabled:opacity-40"><Send className="h-5 w-5" /></button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
