import { getCallRoomState, createCallRoom } from "../calls/rooms.js";

export const createMeetingRoom = async (req, res) => {
  try {
    const room = await createCallRoom(req.authenticatedUser);
    return res.status(201).json(getCallRoomState(room));
  } catch (error) {
    console.error("Could not create call room:", error.message);
    return res.status(503).json({ message: "Could not create a meeting right now." });
  }
};
