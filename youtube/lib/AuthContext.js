"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useTheme } from "next-themes";
import { auth, provider } from "./firebase";
import axiosInstance from "./axiosinstance";

/**
 * @typedef {{
 *   _id: string,
 *   email?: string,
 *   name?: string,
 *   image?: string,
 *   channelname?: string,
 *   username?: string,
 *   location?: string,
 *   themePreference?: "light" | "dark"
 * }} AppUser
 */

/**
 * @typedef {{
 *   user: AppUser | null,
 *   login: (userData: AppUser) => void,
 *   logout: () => Promise<void>,
 *   handlegooglesignin: () => Promise<void>,
 *   pendingVerification: { challengeId: string, email: string } | null,
 *   verifyLogin: (code: string) => Promise<boolean>,
 *   resendLoginCode: () => Promise<void>,
 *   authError: string,
 *   isSigningIn: boolean,
 *   changeThemePreference: (theme: "light" | "dark") => Promise<void>
 * }} UserContextValue
 */

/** @type {UserContextValue} */
const defaultUserContext = {
  user: null,
  login: () => {},
  logout: async () => {},
  handlegooglesignin: async () => {},
  pendingVerification: null,
  verifyLogin: async () => false,
  resendLoginCode: async () => {},
  authError: "",
  isSigningIn: false,
  changeThemePreference: async () => {},
};

const UserContext = createContext(defaultUserContext);

const requestBrowserCoordinates = () =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  });

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const processingUid = useRef(null);
  const locationRequest = useRef(null);
  const { setTheme } = useTheme();

  const login = useCallback(
    (userData) => {
      setUser((currentUser) => ({ ...currentUser, ...userData }));
      localStorage.setItem("user", JSON.stringify(userData));
      if (userData?.themePreference) setTheme(userData.themePreference);
      setPendingVerification(null);
      setAuthError("");
      setIsSigningIn(false);
    },
    [setTheme],
  );

  const logout = useCallback(async () => {
    setUser(null);
    setPendingVerification(null);
    localStorage.removeItem("user");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  }, []);

  const completeSignIn = useCallback(
    async (firebaseUser) => {
      if (!firebaseUser) return;
      if (processingUid.current === firebaseUser.uid) return;
      processingUid.current = firebaseUser.uid;
      setIsSigningIn(true);
      setAuthError("");
      try {
        const locationCoordinates = locationRequest.current
          ? await locationRequest.current
          : null;
        locationRequest.current = null;
        const idToken = await firebaseUser.getIdToken();
        const response = await axiosInstance.post(
          "/user/login",
          {
            idToken,
            ...(locationCoordinates ? { locationCoordinates } : {}),
          },
          { withCredentials: true },
        );
        if (response.data.verificationRequired) {
          setPendingVerification({
            challengeId: response.data.challengeId,
            email: response.data.email,
          });
          setUser(null);
          localStorage.removeItem("user");
          setIsSigningIn(false);
          processingUid.current = null;
          return;
        }
        login(response.data.result);
      } catch (error) {
        console.error("Secure sign-in failed:", error);
        setAuthError(
          error?.response?.data?.message ||
            "Unable to securely sign in. Please try again.",
        );
        setIsSigningIn(false);
      } finally {
        processingUid.current = null;
      }
    },
    [login],
  );

  const handlegooglesignin = async () => {
    setAuthError("");
    setIsSigningIn(true);
    const shareLocation = window.confirm(
      "Share your approximate location? Your coordinates will be sent to OpenStreetMap Nominatim to look up your city, state, country, and approximate address. The city may appear with your comments; location details are saved in sign-in security history.",
    );
    const requestedLocation = shareLocation
      ? requestBrowserCoordinates()
      : Promise.resolve(null);
    locationRequest.current = requestedLocation;
    try {
      const result = await signInWithPopup(auth, provider);
      await completeSignIn(result.user);
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setAuthError("Google sign-in was cancelled or could not be completed.");
      setIsSigningIn(false);
    } finally {
      if (locationRequest.current === requestedLocation) {
        locationRequest.current = null;
      }
    }
  };

  const verifyLogin = async (code) => {
    if (!pendingVerification || !auth.currentUser) {
      setAuthError("Sign in again to request a new verification code.");
      return false;
    }
    setIsSigningIn(true);
    setAuthError("");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await axiosInstance.post(
        "/user/verify-login",
        { challengeId: pendingVerification.challengeId, code, idToken },
        { withCredentials: true },
      );
      login(response.data.result);
      return true;
    } catch (error) {
      console.error("Login verification failed:", error);
      setAuthError(
        error?.response?.data?.message ||
          "Unable to verify sign-in. Please try again.",
      );
      setIsSigningIn(false);
      return false;
    }
  };

  const resendLoginCode = async () => {
    if (!auth.currentUser) {
      setAuthError("Sign in again to request a new verification code.");
      return;
    }
    await completeSignIn(auth.currentUser);
  };

  const changeThemePreference = async (theme) => {
    if (!auth.currentUser || !["light", "dark"].includes(theme)) return;
    const idToken = await auth.currentUser.getIdToken();
    const response = await axiosInstance.patch(
      "/user/preferences/theme",
      { theme },
      { headers: { Authorization: `Bearer ${idToken}` } },
    );
    setTheme(response.data.themePreference);
    setUser((currentUser) => {
      const updated = { ...currentUser, themePreference: response.data.themePreference };
      localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        void completeSignIn(firebaseUser);
      } else {
        setUser(null);
        localStorage.removeItem("user");
      }
    });
    return unsubscribe;
  }, [completeSignIn]);

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        handlegooglesignin,
        pendingVerification,
        verifyLogin,
        resendLoginCode,
        authError,
        isSigningIn,
        changeThemePreference,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
