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
import { reportComment } from "../controllers/commentReport.js";

const routes = express.Router();
routes.post("/report", reportComment);
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", commentRateLimit, postcomment);
routes.delete("/deletecomment/:id", deletecomment);
routes.post("/editcomment/:id", editcomment);
routes.post("/vote/:commentid", voteComment);
routes.get("/votes/:videoid", getCommentVotes);
routes.post("/:commentid/replies", replyRateLimit, addReply);
routes.get("/:commentid/replies", getReplies);
routes.delete("/reply/:id", deleteReply);
routes.post("/translate", translateComment);
export default routes;