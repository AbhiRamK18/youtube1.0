import { auth } from "./firebase";

export const getFirebaseAuthConfig = async () => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error("Please sign in again to continue.");
  }
  const idToken = await firebaseUser.getIdToken();
  return { headers: { Authorization: `Bearer ${idToken}` } };
};
