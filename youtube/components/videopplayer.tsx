"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Captions,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getVideoUrl } from "@/lib/videoUrl";

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];
const COMPLETION_WATCH_PERCENTAGE = 0.9;
const AUTOPLAY_COUNTDOWN_SECONDS = 5;
const PROGRESS_SAVE_INTERVAL_MS = 5000;

interface CaptionTrack {
  src: string;
  label: string;
  language: string;
}

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
    filetype?: string;
    captions?: CaptionTrack[];
  };
  nextVideo?: { _id: string; videotitle: string };
  theaterMode?: boolean;
  onTheaterModeChange?: (enabled: boolean) => void;
  completionWatchPercentage?: number;
}

interface SavedProgress {
  position: number;
  completed: boolean;
}

const progressStorageKey = (videoId: string) => `watch-progress:${videoId}`;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
};

export default function VideoPlayer({
  video,
  nextVideo,
  theaterMode = false,
  onTheaterModeChange,
  completionWatchPercentage = COMPLETION_WATCH_PERCENTAGE,
}: VideoPlayerProps) {
  const router = useRouter();
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedAt = useRef(0);
  const restoredProgress = useRef(false);
  const completedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState("");
  const [preview, setPreview] = useState<{ time: number; left: number } | null>(
    null,
  );
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(
    null,
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const completionThreshold = Number.isFinite(completionWatchPercentage)
    ? Math.max(0, Math.min(1, completionWatchPercentage))
    : COMPLETION_WATCH_PERCENTAGE;

  const saveProgress = useCallback(
    (position: number, completed: boolean) => {
      try {
        completedRef.current ||= completed;
        const progress = { position, completed: completedRef.current };
        localStorage.setItem(progressStorageKey(video._id), JSON.stringify(progress));
        setSavedProgress(progress);
      } catch (storageError) {
        console.error("Unable to save video watch progress:", storageError);
      }
    },
    [video._id],
  );

  const seekTo = useCallback((time: number) => {
    const player = videoRef.current;
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, time));
  }, []);

  const togglePlayback = useCallback(() => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      document.querySelectorAll("video").forEach((otherVideo) => {
        if (otherVideo !== player) otherVideo.pause();
      });
      void player.play().catch((playError: unknown) => {
        console.error("Unable to start video playback:", playError);
      });
    } else {
      player.pause();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = playerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (fullscreenError) {
      console.error("Unable to change fullscreen mode:", fullscreenError);
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const player = videoRef.current;
    if (!player || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === player) {
        await document.exitPictureInPicture();
      } else {
        await player.requestPictureInPicture();
      }
    } catch (pictureInPictureError) {
      console.error("Unable to change Picture-in-Picture mode:", pictureInPictureError);
    }
  }, []);

  const changePlaybackRate = useCallback((rate: number) => {
    if (!PLAYBACK_RATES.includes(rate)) return;
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const toggleCaptions = useCallback(() => {
    const player = videoRef.current;
    if (!player?.textTracks.length) return;
    const nextEnabled = !captionsEnabled;
    Array.from(player.textTracks).forEach((track) => {
      track.mode =
        nextEnabled && track === player.textTracks[0] ? "showing" : "hidden";
    });
    setCaptionsEnabled(nextEnabled);
  }, [captionsEnabled]);

  const goToNextVideo = useCallback(() => {
    if (nextVideo) router.push(`/watch/${nextVideo._id}`);
  }, [nextVideo, router]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (playing) {
      hideControlsTimer.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2500);
    }
  }, [playing]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player) return;

    const onLoadedMetadata = () => {
      setDuration(player.duration);
      setQuality(
        player.videoWidth && player.videoHeight
          ? `${player.videoWidth}×${player.videoHeight}`
          : "",
      );
      if (!restoredProgress.current) {
        restoredProgress.current = true;
        try {
          const stored = localStorage.getItem(progressStorageKey(video._id));
          if (stored) {
            const progress = JSON.parse(stored) as SavedProgress;
            completedRef.current = Boolean(progress.completed);
            if (
              Number.isFinite(progress.position) &&
              progress.position > 0 &&
              progress.position < player.duration - 1
            ) {
              player.currentTime = progress.position;
              setCurrentTime(progress.position);
              setSavedProgress(progress);
            }
          }
        } catch (storageError) {
          console.error("Unable to restore video watch progress:", storageError);
        }
      }
      setLoading(false);
    };
    const onTimeUpdate = () => {
      setCurrentTime(player.currentTime);
      const percentage = player.duration
        ? player.currentTime / player.duration
        : 0;
      if (percentage >= completionThreshold && !completedRef.current) {
        saveProgress(player.currentTime, true);
      } else if (Date.now() - lastSavedAt.current >= PROGRESS_SAVE_INTERVAL_MS) {
        lastSavedAt.current = Date.now();
        saveProgress(player.currentTime, false);
      }
    };
    const onProgress = () => {
      if (!player.buffered.length || !player.duration) return;
      setBuffered(
        (player.buffered.end(player.buffered.length - 1) / player.duration) *
          100,
      );
    };
    const onPlay = () => {
      setPlaying(true);
      showControls();
    };
    const onPause = () => {
      setPlaying(false);
      if (player.duration) saveProgress(player.currentTime, false);
      setControlsVisible(true);
    };
    const onEnded = () => {
      setPlaying(false);
      saveProgress(player.duration, true);
      setCountdown(nextVideo ? AUTOPLAY_COUNTDOWN_SECONDS : null);
      setControlsVisible(true);
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onError = () => {
      setLoading(false);
      setError("This video could not be played.");
    };

    player.addEventListener("loadedmetadata", onLoadedMetadata);
    player.addEventListener("timeupdate", onTimeUpdate);
    player.addEventListener("progress", onProgress);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("waiting", onWaiting);
    player.addEventListener("canplay", onCanPlay);
    player.addEventListener("error", onError);

    return () => {
      player.removeEventListener("loadedmetadata", onLoadedMetadata);
      player.removeEventListener("timeupdate", onTimeUpdate);
      player.removeEventListener("progress", onProgress);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("waiting", onWaiting);
      player.removeEventListener("canplay", onCanPlay);
      player.removeEventListener("error", onError);
      if (player.duration) saveProgress(player.currentTime, false);
    };
  }, [
    completionThreshold,
    nextVideo,
    saveProgress,
    showControls,
    video._id,
  ]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      goToNextVideo();
      return;
    }
    const timer = setTimeout(() => setCountdown((value) => (value ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, goToNextVideo]);

  useEffect(
    () => () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        (!playerRef.current?.matches(":hover") &&
          !playerRef.current?.contains(document.activeElement))
      ) {
        return;
      }
      const player = videoRef.current;
      if (!player) return;

      const key = event.key.toLowerCase();
      if (event.code === "Space" || key === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        const interval = event.shiftKey ? 30 : 10;
        seekTo(player.currentTime + (key === "arrowleft" ? -interval : interval));
      } else if (key === "arrowup" || key === "arrowdown") {
        event.preventDefault();
        const nextVolume = Math.max(
          0,
          Math.min(1, player.volume + (key === "arrowup" ? 0.05 : -0.05)),
        );
        player.volume = nextVolume;
        setVolume(nextVolume);
        if (nextVolume > 0) {
          player.muted = false;
          setMuted(false);
        }
      } else if (key === "m") {
        player.muted = !player.muted;
        setMuted(player.muted);
      } else if (key === "f") {
        void toggleFullscreen();
      } else if (key === "p") {
        void togglePictureInPicture();
      } else if (key === "t") {
        onTheaterModeChange?.(!theaterMode);
      } else if (key === "c" && player.textTracks.length) {
        toggleCaptions();
      } else if (key === "." || key === ">") {
        const nextRate = PLAYBACK_RATES.find((rate) => rate > player.playbackRate);
        if (nextRate) changePlaybackRate(nextRate);
      } else if (key === "," || key === "<") {
        const previousRate = [...PLAYBACK_RATES]
          .reverse()
          .find((rate) => rate < player.playbackRate);
        if (previousRate) changePlaybackRate(previousRate);
      } else if (key === "n" && nextVideo) {
        goToNextVideo();
      }
      showControls();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    changePlaybackRate,
    goToNextVideo,
    nextVideo,
    onTheaterModeChange,
    seekTo,
    showControls,
    theaterMode,
    toggleCaptions,
    toggleFullscreen,
    togglePictureInPicture,
    togglePlayback,
  ]);

  const handleTimelineHover = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const time = ratio * duration;
    setPreview({ time, left: ratio * 100 });
    if (previewRef.current && Number.isFinite(time)) {
      previewRef.current.currentTime = time;
    }
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={playerRef}
      tabIndex={0}
      aria-label={`Video player: ${video.videotitle}`}
      onMouseMove={showControls}
      onMouseLeave={() => {
        setPreview(null);
        if (playing) setControlsVisible(false);
      }}
      onFocus={showControls}
      className={`group relative aspect-video overflow-hidden bg-black text-white outline-none ${
        theaterMode ? "w-full rounded-none" : "rounded-lg"
      }`}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        preload="metadata"
        onClick={togglePlayback}
        onDoubleClick={() => void toggleFullscreen()}
      >
        <source src={getVideoUrl(video.filepath)} type={video.filetype || "video/mp4"} />
        {video.captions?.map((track) => (
          <track
            key={`${track.language}-${track.src}`}
            kind="captions"
            src={getVideoUrl(track.src)}
            srcLang={track.language}
            label={track.label}
          />
        ))}
        Your browser does not support the video tag.
      </video>

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center">
          {error}
        </div>
      )}
      {!playing && !error && !loading && (
        <button
          type="button"
          aria-label="Play video"
          onClick={togglePlayback}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 p-4 hover:bg-black/80"
        >
          <Play className="h-8 w-8 fill-current" />
        </button>
      )}

      {savedProgress && savedProgress.position > 0 && currentTime === savedProgress.position && (
        <div className="absolute left-3 top-3 rounded bg-black/75 px-3 py-2 text-sm">
          Resuming from {formatTime(savedProgress.position)}
        </div>
      )}
      {countdown !== null && nextVideo && (
        <div className="absolute right-4 top-4 z-10 max-w-xs rounded bg-black/85 p-3 shadow-lg">
          <p className="text-sm">Up next in {countdown}s: {nextVideo.videotitle}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={goToNextVideo}
              className="rounded bg-white px-3 py-1 text-sm text-black"
            >
              Play now
            </button>
            <button
              type="button"
              onClick={() => setCountdown(null)}
              className="rounded border border-white/50 px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="group/timeline relative mb-2 flex h-5 cursor-pointer items-center"
          onMouseMove={handleTimelineHover}
          onMouseLeave={() => setPreview(null)}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            seekTo(((event.clientX - bounds.left) / bounds.width) * duration);
          }}
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") seekTo(currentTime - 10);
            if (event.key === "ArrowRight") seekTo(currentTime + 10);
          }}
        >
          {preview && duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-6 z-20 w-36 -translate-x-1/2 overflow-hidden rounded border border-white/30 bg-black shadow-lg"
              style={{ left: `${preview.left}%` }}
            >
              <video
                ref={previewRef}
                src={getVideoUrl(video.filepath)}
                muted
                preload="metadata"
                className="aspect-video w-full object-contain"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = preview.time;
                }}
              />
              <span className="block py-1 text-center text-xs">{formatTime(preview.time)}</span>
            </div>
          )}
          <div className="relative h-1 w-full rounded bg-white/35 group-hover/timeline:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded bg-white/35"
              style={{ width: `${buffered}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded bg-red-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback} className="hover:text-gray-300">
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </button>
          <button
            type="button"
            aria-label="Seek backward 10 seconds"
            onClick={() => seekTo(currentTime - 10)}
            className="hover:text-gray-300"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Seek forward 10 seconds"
            onClick={() => seekTo(currentTime + 10)}
            className="hover:text-gray-300"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const player = videoRef.current;
              if (!player) return;
              player.muted = !player.muted;
              setMuted(player.muted);
            }}
            className="hover:text-gray-300"
          >
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(event) => {
              const nextVolume = Number(event.target.value);
              const player = videoRef.current;
              if (player) {
                player.volume = nextVolume;
                player.muted = nextVolume === 0;
              }
              setVolume(nextVolume);
              setMuted(nextVolume === 0);
            }}
            className="w-20 accent-white"
          />
          <span className="whitespace-nowrap tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
            {duration > 0 && ` (-${formatTime(duration - currentTime)})`}
          </span>
          {quality && <span className="hidden text-xs text-white/80 sm:inline">{quality}</span>}
          <label className="ml-auto flex items-center gap-1">
            <span className="sr-only">Playback speed</span>
            <select
              aria-label="Playback speed"
              value={playbackRate}
              onChange={(event) => changePlaybackRate(Number(event.target.value))}
              className="rounded bg-black/70 px-1 py-1 text-xs"
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>{rate}×</option>
              ))}
            </select>
          </label>
          {video.captions?.length ? (
            <button
              type="button"
              aria-label={captionsEnabled ? "Turn captions off" : "Turn captions on"}
              aria-pressed={captionsEnabled}
              onClick={toggleCaptions}
              className={captionsEnabled ? "text-blue-300" : "hover:text-gray-300"}
            >
              <Captions className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={theaterMode ? "Exit theater mode" : "Theater mode"}
            onClick={() => onTheaterModeChange?.(!theaterMode)}
            className="hidden hover:text-gray-300 sm:inline-flex"
          >
            Theater
          </button>
          {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
            <button
              type="button"
              aria-label="Picture in Picture"
              onClick={() => void togglePictureInPicture()}
              className="hover:text-gray-300"
            >
              <PictureInPicture className="h-5 w-5" />
            </button>
          )}
          <button type="button" aria-label="Toggle fullscreen" onClick={() => void toggleFullscreen()} className="hover:text-gray-300">
            {isFullscreen
              ? <Minimize className="h-5 w-5" />
              : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
