export function getVideoUrl(filepath?: string): string {
  if (!filepath) {
    return "";
  }

  const filename = filepath.replace(/\\/g, "/").split("/").pop();
  if (!filename) {
    return "";
  }

  const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");
  return `${backendUrl}/uploads/${encodeURIComponent(filename)}`;
}
