"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";

const ACTIVE_CALL_STORAGE_KEY = "active-video-call-room";

const subscribeToSavedCall = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

const getSavedCallSnapshot = () =>
  typeof window === "undefined"
    ? null
    : window.localStorage.getItem(ACTIVE_CALL_STORAGE_KEY);

export default function CallsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [roomId, setRoomId] = useState("");
  const [creating, setCreating] = useState(false);
  const savedCall = useSyncExternalStore(subscribeToSavedCall, getSavedCallSnapshot, () => null);
  const savedRoomId = savedCall?.startsWith(`${user?._id}:`)
    ? savedCall.slice(String(user?._id).length + 1)
    : "";

  const createMeeting = async () => {
    if (!user) {
      toast.error("Sign in on a trusted device to create a call.");
      return;
    }
    setCreating(true);
    try {
      const config = await getFirebaseAuthConfig();
      const response = await axiosInstance.post("/calls/rooms", {}, config);
      window.localStorage.setItem(
        ACTIVE_CALL_STORAGE_KEY,
        `${user._id}:${response.data.roomId}`,
      );
      router.push(`/calls/${response.data.roomId}`);
    } catch (error) {
      console.error("Could not create meeting:", error);
      toast.error("Could not create a meeting. Check your sign-in and try again.");
    } finally {
      setCreating(false);
    }
  };

  const joinMeeting = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      toast.error("Sign in on a trusted device to join a call.");
      return;
    }
    const normalized = roomId.trim().toUpperCase();
    if (!/^[A-F0-9]{12}$/.test(normalized)) {
      toast.error("Enter the 12-character meeting code.");
      return;
    }
    router.push(`/calls/${normalized}`);
  };

  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto mt-4 grid max-w-4xl gap-4 sm:mt-10 sm:gap-6 md:grid-cols-2">
        <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-7">
          <h1 className="text-2xl font-bold">Start a video call</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a private meeting for up to four signed-in participants.
          </p>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createMeeting()}
            className="mt-6 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create meeting"}
          </button>
        </section>
        <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-7">
          <h2 className="text-2xl font-bold">Join a meeting</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask the host for their 12-character meeting code.
          </p>
          <form onSubmit={joinMeeting} className="mt-6 flex min-w-0 flex-wrap gap-2">
            <input
              aria-label="Meeting code"
              autoComplete="off"
              maxLength={12}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value.toUpperCase())}
              placeholder="A1B2C3D4E5F6"
              className="min-w-[0] flex-1 rounded-lg border bg-background px-3 py-2 font-mono uppercase"
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg border px-4 py-2 font-medium hover:bg-muted"
            >
              Join
            </button>
          </form>
          {savedRoomId && (
            <button
              type="button"
              onClick={() => router.push(`/calls/${savedRoomId}`)}
              className="mt-4 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Return to your recent meeting
            </button>
          )}
        </section>
        <p className="text-xs text-muted-foreground md:col-span-2">
          This peer-to-peer prototype is limited to four people per meeting. For
          reliable calls across restrictive networks, configure the TURN settings
          on the server.
        </p>
      </div>
    </main>
  );
}
