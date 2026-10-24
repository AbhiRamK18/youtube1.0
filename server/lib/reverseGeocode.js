let nextRequestAt = 0;

const waitForNominatimSlot = async () => {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + 1000;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
};

export const getCityFromCoordinates = async (coordinates) => {
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  await waitForNominatimSlot();
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "10",
    addressdetails: "1",
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "YourTube/1.0",
        Referer: process.env.FRONTEND_URL || "http://localhost:3000",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Nominatim returned HTTP ${response.status}`);
    }

    const result = await response.json();
    const address = result.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      address.locality;
    const location = typeof city === "string" ? city.trim().slice(0, 100) : "";
    return location || null;
  } catch (error) {
    console.error("OpenStreetMap location lookup failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
