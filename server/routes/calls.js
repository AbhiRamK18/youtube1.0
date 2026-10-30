import express from "express";
import { createMeetingRoom } from "../controllers/calls.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.post("/rooms", requireFirebaseUser, createMeetingRoom);

export default routes;
