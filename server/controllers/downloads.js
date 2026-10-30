import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import DownloadQuota from "../Modals/downloadQuota.js";
import VideoDownload from "../Modals/videoDownload.js";
import Video from "../Modals/video.js";
import { getActivePlan } from "../lib/subscriptionPlans.js";

const uploadDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
);
const ticketLifetimeMs = 5 * 60 * 1000;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const getIndiaQuotaKeys = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const dayKey = `${values.year}-${values.month}-${values.day}`;
  return { dayKey, monthKey: dayKey.slice(0, 7) };
};

const getRequestDevice = (req) => {
  const agent = req.get("user-agent") || "";
  const browser =
    agent.match(/Edg\/([\d.]+)/) ? ["Edge", agent.match(/Edg\/([\d.]+)/)[1]] :
    agent.match(/Firefox\/([\d.]+)/) ? ["Firefox", agent.match(/Firefox\/([\d.]+)/)[1]] :
    agent.match(/Chrome\/([\d.]+)/) ? ["Chrome", agent.match(/Chrome\/([\d.]+)/)[1]] :
    agent.match(/Version\/([\d.]+).*Safari/) ? ["Safari", agent.match(/Version\/([\d.]+).*Safari/)[1]] :
    ["Unknown", ""];
  const deviceType = /ipad|tablet/i.test(agent)
    ? "Tablet"
    : /mobile|android|iphone/i.test(agent)
      ? "Mobile"
      : "Desktop";
  const operatingSystem =
    /windows/i.test(agent) ? "Windows" :
    /mac os|macintosh/i.test(agent) ? "macOS" :
    /android/i.test(agent) ? "Android" :
    /iphone|ipad|ios/i.test(agent) ? "iOS" :
    /linux/i.test(agent) ? "Linux" : "Unknown";
  return {
    browser: browser[0],
    browserVersion: browser[1],
    deviceType,
    deviceModel: "Unknown",
    operatingSystem,
    ipAddress: req.ip || req.socket.remoteAddress || "unknown",
  };
};

const getLocalVideoPath = (video) => {
  const filename = path.basename(video.filepath || "");
  if (!filename || filename !== video.filepath.replace(/\\/g, "/").split("/").pop()) {
    return null;
  }
  const resolved = path.resolve(uploadDirectory, filename);
  return resolved.startsWith(`${uploadDirectory}${path.sep}`) ? resolved : null;
};

const reserveQuota = async (userId, dayKey, monthKey, plan) => {
  try {
    await DownloadQuota.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          dayKey,
          monthKey,
          dailyCount: 0,
          monthlyCount: 0,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  return DownloadQuota.findOneAndUpdate(
    {
      userId,
      $expr: {
        $and: [
          {
            $or: [
              { $ne: ["$dayKey", dayKey] },
              { $lt: ["$dailyCount", plan.dailyDownloads] },
            ],
          },
          {
            $or: [
              { $ne: ["$monthKey", monthKey] },
              { $lt: ["$monthlyCount", plan.monthlyDownloads] },
            ],
          },
        ],
      },
    },
    [
      {
        $set: {
          dayKey,
          monthKey,
          dailyCount: {
            $cond: [
              { $eq: ["$dayKey", dayKey] },
              { $add: ["$dailyCount", 1] },
              1,
            ],
          },
          monthlyCount: {
            $cond: [
              { $eq: ["$monthKey", monthKey] },
              { $add: ["$monthlyCount", 1] },
              1,
            ],
          },
        },
      },
    ],
    { new: true },
  );
};

const refundQuota = async (userId, dayKey, monthKey) => {
  await DownloadQuota.updateOne(
    {
      userId,
      dayKey,
      monthKey,
      dailyCount: { $gt: 0 },
      monthlyCount: { $gt: 0 },
    },
    { $inc: { dailyCount: -1, monthlyCount: -1 } },
  );
};

const issueDownloadTicket = async (record, reservedQuota) => {
  const ticket = randomBytes(32).toString("hex");
  record.ticketHash = sha256(ticket);
  record.ticketExpiresAt = new Date(Date.now() + ticketLifetimeMs);
  record.status = "authorized";
  record.activeAttemptId = new mongoose.Types.ObjectId();
  record.attempts.push({
    _id: record.activeAttemptId,
    startedAt: new Date(),
    status: "authorized",
    reservedQuota,
  });
  await record.save();
  return ticket;
};

export const authorizeVideoDownload = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }

  try {
    const userId = req.authenticatedUser._id;
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });
    const plan = await getActivePlan(userId);
    const ranks = { bronze: 1, silver: 2, gold: 3 };
    if (video.premiumOnly && (ranks[plan.id] || 0) < ranks[video.minimumPlan]) {
      return res.status(403).json({
        message: "This video requires an active higher-tier subscription.",
      });
    }

    const filePath = getLocalVideoPath(video);
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ message: "Video file is unavailable" });
    }

    const { dayKey, monthKey } = getIndiaQuotaKeys();
    const duplicateKey = `${userId}:${videoId}:${dayKey}`;
    let record = await VideoDownload.findOne({ duplicateKey });
    let reservedQuota = false;
    if (!record) {
      const quota = await reserveQuota(userId, dayKey, monthKey, plan);
      if (!quota) {
        return res.status(429).json({
          message: "Your download quota for today or this month has been reached.",
          dailyLimit: plan.dailyDownloads,
          monthlyLimit: plan.monthlyDownloads,
        });
      }
      reservedQuota = true;
      try {
        record = await VideoDownload.create({
          userId,
          videoId,
          duplicateKey,
          ipAddress: req.ip || req.socket.remoteAddress || "unknown",
          ...getRequestDevice(req),
          subscriptionPlan: plan.id,
          fileSize: statSync(filePath).size,
          status: "authorized",
        });
      } catch (error) {
        await refundQuota(userId, dayKey, monthKey);
        if (error.code !== 11000) throw error;
        record = await VideoDownload.findOne({ duplicateKey });
        if (!record) throw error;
      }
    }

    const ticket = await issueDownloadTicket(record, reservedQuota);
    return res.status(200).json({
      downloadUrl: `/video/download/${record._id}?ticket=${ticket}`,
      title: video.videotitle,
      fileSize: record.fileSize,
      subscriptionPlan: record.subscriptionPlan,
      duplicate: !reservedQuota,
      quota: {
        dailyLimit: plan.dailyDownloads,
        monthlyLimit: plan.monthlyDownloads,
      },
    });
  } catch (error) {
    console.error("Download authorization failed:", error);
    return res.status(500).json({ message: "Unable to authorize this download" });
  }
};

export const streamAuthorizedDownload = async (req, res) => {
  const { downloadId } = req.params;
  const { ticket } = req.query;
  if (
    !mongoose.Types.ObjectId.isValid(downloadId) ||
    typeof ticket !== "string" ||
    !/^[a-f0-9]{64}$/i.test(ticket)
  ) {
    return res.status(400).json({ message: "Invalid download ticket" });
  }

  try {
    const record = await VideoDownload.findOne({
      _id: downloadId,
      ticketHash: sha256(ticket),
      ticketExpiresAt: { $gt: new Date() },
    }).populate("videoId");
    if (!record?.videoId) return res.status(403).json({ message: "Download ticket expired" });
    const filePath = getLocalVideoPath(record.videoId);
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ message: "Video file is unavailable" });
    }

    const attempt = record.attempts[record.attempts.length - 1];
    if (attempt) {
      attempt.status = "in_progress";
      attempt.startedAt = new Date();
    }
    record.status = "in_progress";
    await record.save();

    let finished = false;
    res.on("finish", () => {
      finished = true;
      void VideoDownload.updateOne(
        { _id: record._id },
        {
          $set: {
            status: "completed",
            downloadedAt: new Date(),
            "attempts.$[attempt].status": "completed",
            "attempts.$[attempt].finishedAt": new Date(),
          },
        },
        { arrayFilters: [{ "attempt._id": attempt?._id }] },
      ).catch((error) => console.error("Could not record completed download:", error));
    });
    res.on("close", () => {
      if (!finished) {
        void VideoDownload.updateOne(
          { _id: record._id },
          {
            $set: {
              status: "failed",
              "attempts.$[attempt].status": "failed",
              "attempts.$[attempt].finishedAt": new Date(),
              "attempts.$[attempt].failureReason": "Connection interrupted",
            },
          },
          { arrayFilters: [{ "attempt._id": attempt?._id }] },
        ).catch((error) => console.error("Could not record interrupted download:", error));
      }
    });
    return res.download(
      filePath,
      path.basename(record.videoId.filename || record.videoId.videotitle),
      (error) => {
        if (error && !res.headersSent) {
          console.error("Video download stream failed:", error);
          res.status(500).json({ message: "Unable to stream this video" });
        }
      },
    );
  } catch (error) {
    console.error("Authorized download stream failed:", error);
    return res.status(500).json({ message: "Unable to stream this video" });
  }
};

export const getUserDownloads = async (req, res) => {
  try {
    const [downloads, plan] = await Promise.all([
      VideoDownload.find({ userId: req.authenticatedUser._id })
        .populate("videoId", "videotitle thumbnail")
        .sort({ downloadedAt: -1 })
        .limit(100)
        .select("-ticketHash -ticketExpiresAt"),
      getActivePlan(req.authenticatedUser._id),
    ]);
    const { dayKey, monthKey } = getIndiaQuotaKeys();
    const quota = await DownloadQuota.findOne({ userId: req.authenticatedUser._id });
    return res.status(200).json({
      downloads,
      currentPlan: plan,
      quota: {
        dailyUsed: quota?.dayKey === dayKey ? quota.dailyCount : 0,
        dailyLimit: plan.dailyDownloads,
        monthlyUsed: quota?.monthKey === monthKey ? quota.monthlyCount : 0,
        monthlyLimit: plan.monthlyDownloads,
      },
    });
  } catch (error) {
    console.error("Download history load failed:", error);
    return res.status(500).json({ message: "Unable to load download history" });
  }
};

export const servePublicVideo = async (req, res) => {
  const filename = path.basename(req.params.filename);
  try {
    const video = await Video.findOne({ filepath: `/uploads/${filename}` });
    if (!video || video.premiumOnly) return res.sendStatus(404);
    const filePath = getLocalVideoPath(video);
    if (!filePath || !existsSync(filePath)) return res.sendStatus(404);
    return res.sendFile(filePath);
  } catch (error) {
    console.error("Public video stream lookup failed:", error);
    return res.sendStatus(500);
  }
};

export const issuePremiumStreamTicket = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) return res.status(400).json({ message: "Invalid video ID" });
  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });
    const plan = await getActivePlan(req.authenticatedUser._id);
    const ranks = { bronze: 1, silver: 2, gold: 3 };
    if (video.premiumOnly && (ranks[plan.id] || 0) < ranks[video.minimumPlan]) {
      return res.status(403).json({ message: "This video requires an active higher-tier subscription." });
    }
    const filePath = getLocalVideoPath(video);
    if (!filePath || !existsSync(filePath)) return res.status(404).json({ message: "Video file is unavailable" });
    const expires = Date.now() + ticketLifetimeMs;
    const payload = Buffer.from(`${videoId}.${expires}`).toString("base64url");
    const secret = process.env.STREAM_TICKET_SECRET;
    if (!secret) throw new Error("STREAM_TICKET_SECRET is not configured");
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    return res.status(200).json({ url: `${process.env.BACKEND_URL || ""}/video/stream/${videoId}?ticket=${payload}.${signature}` });
  } catch (error) {
    console.error("Premium stream authorization failed:", error);
    return res.status(500).json({ message: "Unable to authorize video playback" });
  }
};

export const streamTicketedVideo = async (req, res) => {
  const { videoId } = req.params;
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
  const [payload, signature] = ticket.split(".");
  const secret = process.env.STREAM_TICKET_SECRET;
  if (!payload || !signature || !secret) return res.sendStatus(403);
  try {
    const expected = createHmac("sha256", secret).update(payload).digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.sendStatus(403);
    }
    const decoded = Buffer.from(payload, "base64url").toString("utf8").split(".");
    if (decoded[0] !== videoId || Number(decoded[1]) < Date.now()) return res.sendStatus(403);
    const video = await Video.findById(videoId);
    const filePath = video && getLocalVideoPath(video);
    if (!video || !filePath || !existsSync(filePath)) return res.sendStatus(404);
    return res.sendFile(filePath);
  } catch (error) {
    console.error("Ticketed video stream failed:", error);
    return res.sendStatus(500);
  }
};
