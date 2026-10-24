"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap;
  invalidateSize: () => void;
  remove: () => void;
};

type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
  remove: () => void;
};

type LeafletApi = {
  map: (element: HTMLElement) => LeafletMap;
  tileLayer: (
    url: string,
    options: { maxZoom: number; attribution: string },
  ) => LeafletLayer;
  marker: (position: [number, number]) => LeafletLayer;
};

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

export default function CurrentLocationMap() {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<LeafletLayer | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href =
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    stylesheet.integrity =
      "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    stylesheet.crossOrigin = "anonymous";
    document.head.appendChild(stylesheet);
    return () => {
      map.current?.remove();
      stylesheet.remove();
    };
  }, []);

  const showCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Location access is not available in this browser.");
      return;
    }
    if (!leafletReady || !window.L || !mapElement.current) {
      setMessage("The map is still loading. Please try again shortly.");
      return;
    }

    setLoading(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position: [number, number] = [
          coords.latitude,
          coords.longitude,
        ];
        if (!map.current) {
          map.current = window.L!.map(mapElement.current!).setView(
            position,
            13,
          );
          window
            .L!.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
              maxZoom: 19,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            })
            .addTo(map.current);
        } else {
          map.current.setView(position, 13);
          marker.current?.remove();
        }
        marker.current = window.L!.marker(position).addTo(map.current);
        window.setTimeout(() => map.current?.invalidateSize(), 0);
        setMessage("Your location is shown for this session only.");
        setLoading(false);
      },
      (error) => {
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to show the map."
            : "Unable to determine your location. Please try again.",
        );
        setLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onReady={() => setLeafletReady(true)}
        onError={() => setMessage("Unable to load the map library.")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Current location map</h2>
          <p className="text-sm text-muted-foreground">
            Location is requested only when you choose to show the map.
          </p>
        </div>
        <Button onClick={showCurrentLocation} disabled={loading}>
          {loading ? "Finding location..." : "Show my location"}
        </Button>
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <div
        ref={mapElement}
        aria-label="Map showing your current location"
        className="h-64 w-full rounded-md bg-muted"
      />
      <p className="text-xs text-muted-foreground">
        Map data &copy; OpenStreetMap contributors. Map requests are sent to
        OpenStreetMap. Coordinates are not saved by this map.
      </p>
    </section>
  );
}
