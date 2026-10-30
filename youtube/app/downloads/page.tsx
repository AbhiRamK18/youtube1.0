"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";
import { downloadVideo } from "@/lib/downloadVideo";

type DownloadItem = {
  _id: string;
  videoId?: { _id: string; videotitle: string; thumbnail?: string } | null;
  downloadedAt: string;
  subscriptionPlan: string;
  fileSize: number;
  status: string;
};

type DownloadsData = {
  downloads: DownloadItem[];
  currentPlan: { name: string };
  quota: {
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
  };
};

export default function DownloadsPage() {
  const { user } = useUser();
  const [data, setData] = useState<DownloadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        return;
      }
      try {
        const config = await getFirebaseAuthConfig();
        const response = await axiosInstance.get("/video/downloads", config);
        if (active) setData(response.data);
      } catch (error: unknown) {
        console.error("Unable to load downloads:", error);
        if (active) {
          toast.error("Unable to load your downloads.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [user]);

  const handleDownloadAgain = async (videoId: string) => {
    setBusyId(videoId);
    try {
      await downloadVideo(videoId);
    } catch (error: unknown) {
      console.error("Download request failed:", error);
      const message =
        axios.isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message
          : undefined;
      toast.error(message || "Unable to start this download.");
    } finally {
      setBusyId("");
    }
  };

  if (!user) {
    return (
      <main className="flex-1 p-6">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <p className="mt-2 text-muted-foreground">Sign in to view your download history.</p>
      </main>
    );
  }

  const quota = data?.quota;
  return (
    <main className="min-w-0 flex-1 space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan: {data?.currentPlan?.name || "Loading"}
        </p>
      </header>

      {quota && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Today</p>
            <p className="text-lg font-semibold">{quota.dailyUsed} / {quota.dailyLimit}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">This month</p>
            <p className="text-lg font-semibold">{quota.monthlyUsed} / {quota.monthlyLimit}</p>
          </div>
        </section>
      )}

      {loading ? (
        <p>Loading download history…</p>
      ) : !data?.downloads?.length ? (
        <p className="rounded-lg border p-5 text-sm text-muted-foreground">No downloads yet.</p>
      ) : (
        <section className="space-y-3">
          {data.downloads.map((download) => (
            <article key={download._id} className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
              {download.videoId?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={download.videoId.thumbnail}
                  alt=""
                  className="h-16 w-28 rounded object-cover"
                />
              ) : (
                <div className="h-16 w-28 rounded bg-muted" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{download.videoId?.videotitle || "Video no longer available"}</h2>
                <p className="text-sm text-muted-foreground">
                  {new Date(download.downloadedAt).toLocaleString()} · {download.subscriptionPlan} plan
                </p>
                <p className="text-xs text-muted-foreground">
                  {download.fileSize ? `${(download.fileSize / (1024 * 1024)).toFixed(1)} MB` : "Size unavailable"} · <span className="capitalize">{download.status.replace("_", " ")}</span>
                </p>
              </div>
              {download.videoId?._id && (
                <button
                  type="button"
                  disabled={busyId === (download.videoId?._id || "")}
                  onClick={() => {
                    const videoId = download.videoId?._id;
                    if (videoId) void handleDownloadAgain(videoId);
                  }}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {busyId === (download.videoId?._id || "") ? "Preparing…" : "Download again"}
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
