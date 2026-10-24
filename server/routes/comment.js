import express from "express";

import {
  deletecomment,
  getallcomment,
  postcomment,
  editcomment,
  voteComment,
  getCommentVotes,
  addReply,
  getReplies,
  deleteReply,
  translateComment,
} from "../controllers/comment.js";
import {
  commentRateLimit,
  replyRateLimit,
} from "../middleware/commentRateLimit.js";
import {
  getCommentReports,
  moderateCommentReport,
  reportComment,
} from "../controllers/commentReport.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";
import { requireAdminUser } from "../middleware/requireAdminUser.js";

const routes = express.Router();
routes.get(
  "/admin/reports",
  requireFirebaseUser,
  requireAdminUser,
  getCommentReports,
);
routes.patch(
  "/admin/reports/:reportId",
  requireFirebaseUser,
  requireAdminUser,
  moderateCommentReport,
);
routes.post("/report", requireFirebaseUser, reportComment);
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", requireFirebaseUser, commentRateLimit, postcomment);
routes.delete("/deletecomment/:id", requireFirebaseUser, deletecomment);
routes.post("/editcomment/:id", requireFirebaseUser, editcomment);
routes.post("/vote/:commentid", requireFirebaseUser, voteComment);
routes.get("/votes/:videoid", getCommentVotes);
routes.post(
  "/:commentid/replies",
  requireFirebaseUser,
  replyRateLimit,
  addReply,
);
routes.get("/:commentid/replies", getReplies);
routes.delete("/reply/:id", requireFirebaseUser, deleteReply);
routes.post("/translate", translateComment);
export default routes;