import express from "express";
import { getallvideo, uploadvideo } from "../controllers/video.js";
import {
  getWatchProgress,
  saveWatchProgress,
} from "../controllers/watchProgress.js";
import upload from "../filehelper/filehelper.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.post("/upload", upload.single("file"), uploadvideo);
routes.get("/progress/:videoId", requireFirebaseUser, getWatchProgress);
routes.put("/progress/:videoId", requireFirebaseUser, saveWatchProgress);
routes.get("/getall", getallvideo);
export default routes;