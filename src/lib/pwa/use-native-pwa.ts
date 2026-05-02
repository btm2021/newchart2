"use client";

import { useEffect } from "react";

const IOS_WAKELOCK_VIDEO_ID = "ios-wake-lock-video";
const IOS_WAKELOCK_SOURCE =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAGbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAzN0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAEAAAEAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAEAAABAAAAAANFbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAWFXEAAAAAAAtaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAt1taW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAKdc3RibAAAALFzdHNkAAAAAAAAAAEAAAChYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAEAAQBIABIAAAASAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAAzYXZjQwFkAB7/4QAZZ2QAHqzZQFAe2AtQEBAaQeJEV,aM4AEAAAMABAAAAwHkeKFVxEhEAAAOobG1wNAAAAAAAAAABAAAAAQAAABRidHJ0AAAAAAAAEHQAAA50AAAAGHN0dHMAAAAAAAAAAQAAAAEAAAIgAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAUc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAAAAAAAAEAAAAPAAAAFGN0dHMAAAAAAAAAAAEAAAABAAAAAA==";

function isIosLike() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function ensureIosWakeLockVideo() {
  let video = document.getElementById(IOS_WAKELOCK_VIDEO_ID) as HTMLVideoElement | null;
  if (video) return video;

  video = document.createElement("video");
  video.id = IOS_WAKELOCK_VIDEO_ID;
  video.playsInline = true;
  video.muted = true;
  video.loop = true;
  video.setAttribute("aria-hidden", "true");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0.001";
  video.style.pointerEvents = "none";
  video.style.bottom = "0";
  video.style.left = "0";
  video.src = IOS_WAKELOCK_SOURCE;
  document.body.appendChild(video);
  return video;
}

export function useNativePwa(enabled: boolean) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let wakeLock: WakeLockSentinel | null = null;
    let disposed = false;
    let iosWakeLockVideo: HTMLVideoElement | null = null;

    const requestWakeLock = async () => {
      if (disposed) return;

      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => {
            wakeLock = null;
          });
          return;
        }
      } catch {
        wakeLock = null;
      }

      if (isIosLike() && isStandalone()) {
        try {
          iosWakeLockVideo = ensureIosWakeLockVideo();
          await iosWakeLockVideo.play();
        } catch {
          iosWakeLockVideo = null;
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch {
          // Ignore release race.
        } finally {
          wakeLock = null;
        }
      }

      if (iosWakeLockVideo) {
        iosWakeLockVideo.pause();
      }
    };

    const syncWakeLock = async () => {
      if (!enabled) {
        await releaseWakeLock();
        return;
      }

      if (document.visibilityState === "visible") {
        await requestWakeLock();
      } else {
        await releaseWakeLock();
      }
    };

    const markFullscreenState = () => {
      document.documentElement.dataset.displayMode = isStandalone() ? "standalone" : "browser";
    };

    markFullscreenState();
    void syncWakeLock();

    window.addEventListener("focus", syncWakeLock);
    document.addEventListener("visibilitychange", syncWakeLock);
    window.addEventListener("pageshow", syncWakeLock);
    window.addEventListener("resize", markFullscreenState);

    return () => {
      disposed = true;
      window.removeEventListener("focus", syncWakeLock);
      document.removeEventListener("visibilitychange", syncWakeLock);
      window.removeEventListener("pageshow", syncWakeLock);
      window.removeEventListener("resize", markFullscreenState);
      void releaseWakeLock();
    };
  }, [enabled]);
}
