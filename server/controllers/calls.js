import { getCallRoomState, createCallRoom } from "../calls/rooms.js";

export const createMeetingRoom = (req, res) => {
  const room = createCallRoom(req.authenticatedUser);
  return res.status(201).json(getCallRoomState(room));
};
