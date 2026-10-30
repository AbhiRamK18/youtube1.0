import express from "express";
import {
  getallvideo,
  updateVideoAccess,
  uploadvideo,
} from "../controllers/video.js";
import {
  authorizeVideoDownload,
  getUserDownloads,
  issuePremiumStreamTicket,
  streamAuthorizedDownload,
  streamTicketedVideo,
} from "../controllers/downloads.js";
import {
  getWatchProgress,
  saveWatchProgress,
} from "../controllers/watchProgress.js";
import upload from "../filehelper/filehelper.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.post("/upload", requireFirebaseUser, upload.single("file"), uploadvideo);
routes.patch("/:videoId/access", requireFirebaseUser, updateVideoAccess);
routes.get("/progress/:videoId", requireFirebaseUser, getWatchProgress);
routes.put("/progress/:videoId", requireFirebaseUser, saveWatchProgress);
routes.get("/downloads", requireFirebaseUser, getUserDownloads);
routes.post("/:videoId/download", requireFirebaseUser, authorizeVideoDownload);
routes.get("/download/:downloadId", streamAuthorizedDownload);
routes.post("/:videoId/stream-ticket", requireFirebaseUser, issuePremiumStreamTicket);
routes.get("/stream/:videoId", streamTicketedVideo);
routes.get("/getall", getallvideo);
export default routes;