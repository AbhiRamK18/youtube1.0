import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import { setServers } from "node:dns";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import subscriptionRoutes from "./routes/subscription.js";
import callRoutes from "./routes/calls.js";
import { servePublicVideo } from "./controllers/downloads.js";
import { attachCallSignaling } from "./calls/signaling.js";
dotenv.config();
const app = express();
const httpServer = createServer(app);
setServers(["1.1.1.1"]);
const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
app.set(
  "trust proxy",
  process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false,
);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.get("/uploads/:filename", servePublicVideo);
app.get("/", (req, res) => {
  res.send("You tube backend is working and connected to mongodb");
});
app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/subscription", subscriptionRoutes);
app.use("/calls", callRoutes);
const PORT = process.env.PORT || 5000;

attachCallSignaling(httpServer, allowedOrigin);
httpServer.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});

const DBURL = process.env.DB_URL;
mongoose
  .connect(DBURL)
  .then(() => {
    console.log("Mongodb connected");
  })
  .catch((error) => {
    console.log(error);
  }); 

export async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}