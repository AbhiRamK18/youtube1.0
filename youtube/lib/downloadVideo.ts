import axiosInstance from "@/lib/axiosinstance";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";

export async function downloadVideo(videoId: string) {
  const config = await getFirebaseAuthConfig();
  const { data } = await axiosInstance.post(
    `/video/${encodeURIComponent(videoId)}/download`,
    {},
    config,
  );
  const downloadUrl = new URL(
    data.downloadUrl,
    axiosInstance.defaults.baseURL || window.location.origin,
  );
  const link = document.createElement("a");
  link.href = downloadUrl.toString();
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return data;
}
