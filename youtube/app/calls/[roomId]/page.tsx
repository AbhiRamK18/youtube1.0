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

function VideoTile({
  name,
  stream,
  muted = false,
  cameraEnabled = true,
  speaking = false,
  local = false,
}: {
  name: string;
  stream?: MediaStream;
  muted?: boolean;
  cameraEnabled?: boolean;
  speaking?: boolean;
  local?: boolean;
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
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
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
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const participantsRef = useRef<Participant[]>([]);
  const myUserIdRef = useRef("");
  const cleanupRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [settings, setSettings] = useState<CallSettings>({
    locked: false,
    chatEnabled: true,
    screenShareEnabled: true,
  });
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
  const currentUserId = user?._id || "";
  const me = participants.find((participant) => participant.userId === currentUserId);
  const isHost = me?.isHost || false;
  const canModerate = Boolean(me?.isHost || me?.isCohost);

  const updateParticipants = useCallback((next: Participant[]) => {
    participantsRef.current = next;
    setParticipants(next);
  }, []);

  const closePeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    pendingIceRef.current.clear();
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
    [closePeers, isHost, router, stopMedia],
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
          }
        } catch (statsError) {
          console.error("Could not read peer connection quality:", statsError);
        }
      }
      const quality =
        maxRtt === 0 ? "unknown" : maxRtt > 0.4 ? "poor" : maxRtt > 0.2 ? "fair" : "good";
      setConnectionQuality(quality);
      socketRef.current?.emit("call:update", { connectionQuality: quality });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(
    () => () => {
      const socket = socketRef.current;
      if (socket?.connected) socket.emit("call:leave");
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
      } catch (cameraError) {
        if (!(cameraError instanceof DOMException) || cameraError.name !== "NotAllowedError") {
          throw cameraError;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        toast.message("Camera access was denied. Joining with microphone only.");
      }
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      setMuted(false);
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
        if (config.iceServers?.length) iceServersRef.current = config.iceServers;
      });

      const emitSignal = (targetUserId: string, type: SignalMessage["type"], signal: unknown) =>
        socket.emit("peer:signal", { targetUserId, type, signal });

      const createPeer = (peerUserId: string) => {
        const existing = peersRef.current.get(peerUserId);
        if (existing) return existing;
        const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
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
          if (peer.connectionState === "failed" || peer.connectionState === "closed") {
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
        const peer = createPeer(peerUserId);
        if (peer.signalingState !== "stable") return;
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          emitSignal(peerUserId, "offer", offer);
        } catch (peerError) {
          console.error("Could not start peer connection:", peerError);
        }
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
          updateParticipants(ack.state.participants);
          setSettings({
            locked: Boolean(ack.state.locked),
            chatEnabled: Boolean(ack.state.chatEnabled),
            screenShareEnabled: Boolean(ack.state.screenShareEnabled),
          });
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - ack.state.startedAt) / 1000)));
          setPhase("joined");
          socket.emit("call:update", {
            muted: false,
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
        setPhase("error");
      });
      socket.on("disconnect", () => {
        closePeers();
        if (!cleanupRef.current) setError("Connection lost. Reconnecting…");
      });
      socket.on("call:participants", updateParticipants);
      socket.on("call:settings", (next: CallSettings) => setSettings(next));
      socket.on("call:participant-joined", ({ userId }: { userId: string }) => {
        if (userId !== myUserIdRef.current) void connectToPeer(userId);
      });
      socket.on("call:participant-offline", ({ userId }: { userId: string }) => {
        peersRef.current.get(userId)?.close();
        peersRef.current.delete(userId);
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
      socket.on("call:chat", (message: ChatMessage) =>
        setMessages((current) => [...current.slice(-99), message]),
      );
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
    if (me?.mutedByHost && muted) {
      toast.error("The host has muted your microphone. Ask them to allow you to unmute.");
      return;
    }
    const nextMuted = !muted;
    for (const track of localStreamRef.current?.getAudioTracks() || []) {
      track.enabled = !nextMuted;
    }
    setMuted(nextMuted);
    socketRef.current?.emit("call:update", { muted: nextMuted });
  };

  const toggleCamera = () => {
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

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || !settings.chatEnabled) return;
    socketRef.current?.emit("call:chat", { text });
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
      socketRef.current?.emit("call:chat", {
        attachment: { name: file.name, type: file.type, dataUrl },
      });
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

      <div className={`grid gap-4 ${chatOpen ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}>
        <section>
          <div className="grid gap-3 sm:grid-cols-2">
            <VideoTile
              name={user.channelname || user.username || user.name || "You"}
              stream={localStream || undefined}
              muted
              cameraEnabled={cameraEnabled || sharingScreen}
              speaking={speakingUsers.has(currentUserId)}
              local
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
                />
              ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={toggleMicrophone} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={`rounded-full p-3 ${muted ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
              {muted ? <MicOff /> : <Mic />}
            </button>
            <button type="button" onClick={toggleCamera} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} className={`rounded-full p-3 ${!cameraEnabled ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
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
              </div>
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
