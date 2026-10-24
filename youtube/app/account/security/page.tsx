"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import CurrentLocationMap from "@/components/CurrentLocationMap";

interface LoginRecord {
  _id: string;
  ipAddress: string;
  browser: string;
  browserVersion: string;
  operatingSystem: string;
  deviceType: string;
  deviceModel: string;
  city: string;
  state: string;
  country: string;
  status: string;
  createdAt: string;
}

interface TrustedDevice extends LoginRecord {
  label: string;
  trustedUntil: string;
  lastUsedAt: string;
}

export default function AccountSecurityPage() {
  const { user } = useUser();
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authorizedConfig = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error("Please sign in again to view security settings.");
    const token = await firebaseUser.getIdToken();
    return { headers: { Authorization: `Bearer ${token}` } };
  }, []);

  const loadSecurityData = useCallback(async () => {
    try {
      const config = await authorizedConfig();
      const [historyResponse, devicesResponse] = await Promise.all([
        axiosInstance.get("/user/security/logins", config),
        axiosInstance.get("/user/security/devices", config),
      ]);
      setLoginHistory(historyResponse.data);
      setDevices(devicesResponse.data);
      setError("");
    } catch (loadError) {
      console.error("Unable to load account security information:", loadError);
      setError("Unable to load security information. Please sign in again and retry.");
    } finally {
      setLoading(false);
    }
  }, [authorizedConfig]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadSecurityData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSecurityData, user]);

  const revokeDevice = async (deviceId: string) => {
    try {
      const config = await authorizedConfig();
      await axiosInstance.delete(`/user/security/devices/${deviceId}`, config);
      setDevices((current) => current.filter((device) => device._id !== deviceId));
    } catch (revokeError) {
      console.error("Unable to revoke trusted device:", revokeError);
      setError("Unable to revoke that device. Please retry.");
    }
  };

  if (!user) {
    return <main className="mx-auto max-w-3xl p-6">Sign in to view account security.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review recent sign-ins and remove devices you no longer trust.
        </p>
      </header>

      <CurrentLocationMap />

      {error && <p role="alert" className="rounded border border-red-300 p-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p>Loading security details...</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Trusted devices</h2>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trusted devices.</p>
            ) : (
              devices.map((device) => (
                <article key={device._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{device.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.deviceType} · {device.ipAddress} · Last used{" "}
                      {new Date(device.lastUsedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Trusted until {new Date(device.trustedUntil).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => void revokeDevice(device._id)}>
                    Revoke
                  </Button>
                </article>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Recent login activity</h2>
            {loginHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No login activity recorded.</p>
            ) : (
              <div className="space-y-2">
                {loginHistory.map((record) => (
                  <article key={record._id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium">
                        {record.browser} {record.browserVersion} · {record.operatingSystem} · {record.deviceType}
                      </p>
                      <span className="text-sm capitalize">{record.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {record.deviceModel} · {record.ipAddress}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[record.city, record.state, record.country]
                        .filter((place) => place && place !== "Unavailable")
                        .join(", ") || "Location unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(record.createdAt).toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
