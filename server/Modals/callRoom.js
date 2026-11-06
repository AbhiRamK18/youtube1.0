import mongoose from "mongoose";

const callRoomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    hostUserId: { type: String, required: true, index: true },
    hostName: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    locked: { type: Boolean, default: false },
    chatEnabled: { type: Boolean, default: true },
    screenShareEnabled: { type: Boolean, default: true },
    cohostIds: { type: [String], default: [] },
  },
  { versionKey: false },
);

export default mongoose.models.callroom ||
  mongoose.model("callroom", callRoomSchema);
