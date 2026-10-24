import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const getFirebaseAdminAuth = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const error = new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    error.code = "firebase-admin/not-configured";
    throw error;
  }

  if (!getApps().length) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      const error = new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON",
      );
      error.code = "firebase-admin/invalid-config";
      throw error;
    }
    initializeApp({ credential: cert(serviceAccount) });
  }

  return getAuth();
};
