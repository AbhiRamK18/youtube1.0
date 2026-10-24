"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

type ReportStatus = "pending" | "reviewed" | "action_taken" | "dismissed";
type StatusFilter = ReportStatus | "all";

interface ReportUser {
  username?: string;
  channelname?: string;
}

interface ReportedComment {
  _id: string;
  commentbody: string;
  usercommented?: string;
  isDeleted: boolean;
  createdAt: string;
}

interface CommentReport {
  _id: string;
  commentid: ReportedComment | null;
  reporterid: ReportUser | null;
  reason: string;
  details: string;
  status: ReportStatus;
  moderationNote: string;
  moderatedBy: ReportUser | null;
  moderatedAt: string | null;
  createdAt: string;
}

const userLabel = (user: ReportUser | null) =>
  user?.channelname || (user?.username ? `@${user.username}` : "Unknown user");

export default function CommentModerationPage() {
  const { user } = useUser();
  const [reports, setReports] = useState<CommentReport[]>([]);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [loadedStatus, setLoadedStatus] = useState<StatusFilter | null>(null);
  const [error, setError] = useState("");
  const loading = Boolean(user && loadedStatus !== status);

  const loadReports = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setError("Sign in on a verified, trusted device to review reports.");
      setLoadedStatus(status);
      return;
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await axiosInstance.get<CommentReport[]>(
        `/comment/admin/reports?status=${status}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      setReports(response.data);
      setError("");
    } catch (loadError) {
      console.error("Unable to load moderation reports:", loadError);
      const response = (
        loadError as { response?: { data?: { message?: string } } }
      ).response;
      setError(
        response?.data?.message ||
          "Unable to load comment reports. Please retry.",
      );
    } finally {
      setLoadedStatus(status);
    }
  }, [status]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReports, user]);

  const moderateReport = async (
    reportId: string,
    decision: "reviewed" | "dismissed" | "remove",
  ) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setError("Sign in again to record a moderation decision.");
      return;
    }

    setActingOn(reportId);
    setError("");
    try {
      const idToken = await firebaseUser.getIdToken();
      await axiosInstance.patch(
        `/comment/admin/reports/${reportId}`,
        { decision, note: notes[reportId] || "" },
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      await loadReports();
    } catch (moderationError) {
      console.error("Unable to record moderation decision:", moderationError);
      const response = (
        moderationError as { response?: { data?: { message?: string } } }
      ).response;
      setError(
        response?.data?.message ||
          "Unable to record this decision. Please retry.",
      );
    } finally {
      setActingOn(null);
    }
  };

  if (!user) {
    return (
      <main className="w-full p-6">
        Sign in with an allowed administrator Google account to review comment
        reports.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Comment moderation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review reports and record an outcome. Removing a comment hides it
            without removing its moderation history.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Report status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground [color-scheme:light] dark:[color-scheme:dark]"
          >
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="action_taken">Action taken</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All reports</option>
          </select>
        </label>
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No reports found for this status.
        </p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const comment = report.commentid;
            const canResolve =
              report.status === "pending" || report.status === "reviewed";
            return (
              <article key={report._id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {report.reason.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {report.status.replace(/_/g, " ")} ·{" "}
                    {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-1 rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">
                    {comment
                      ? `Comment by ${comment.usercommented || "Unknown user"}`
                      : "The reported comment no longer exists"}
                  </p>
                  {comment && (
                    <p className="whitespace-pre-wrap text-sm">
                      {comment.isDeleted
                        ? "This comment has already been removed."
                        : comment.commentbody}
                    </p>
                  )}
                </div>

                <p className="text-sm">
                  <span className="font-medium">Reported by:</span>{" "}
                  {userLabel(report.reporterid)}
                </p>
                {report.details && (
                  <p className="text-sm">
                    <span className="font-medium">Reporter details:</span>{" "}
                    {report.details}
                  </p>
                )}
                {report.moderatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Decision recorded by {userLabel(report.moderatedBy)} on{" "}
                    {new Date(report.moderatedAt).toLocaleString()}
                    {report.moderationNote
                      ? ` — ${report.moderationNote}`
                      : ""}
                  </p>
                )}

                {canResolve && (
                  <>
                    <label className="block space-y-1 text-sm">
                      <span>Moderation note (optional)</span>
                      <textarea
                        value={notes[report._id] || ""}
                        maxLength={1000}
                        rows={2}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [report._id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={actingOn === report._id}
                        onClick={() => void moderateReport(report._id, "reviewed")}
                      >
                        Mark reviewed
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingOn === report._id}
                        onClick={() => void moderateReport(report._id, "dismissed")}
                      >
                        Dismiss report
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={
                          actingOn === report._id || !comment || comment.isDeleted
                        }
                        onClick={() => void moderateReport(report._id, "remove")}
                      >
                        Remove comment
                      </Button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
