import { useCallback, useEffect } from "react";

import { usePointerLock } from "./usePointerLock";

export const useFullscreen = (
  videoElm: React.RefObject<HTMLVideoElement>,
  pointerLock: ReturnType<typeof usePointerLock>,
  isFullscreen?: number
) => {
  const isFullscreenEnabled = document.fullscreenEnabled;

  const requestKeyboardLock = useCallback(async () => {
    if (!videoElm.current) return;

    if ("keyboard" in navigator) {
      try {
        // @ts-expect-error - keyboard lock API
        await navigator.keyboard.lock();
      } catch {
        // ignore errors
      }
    }
  }, [videoElm]);

  const releaseKeyboardLock = useCallback(async () => {
    if ("keyboard" in navigator) {
      try {
        // @ts-expect-error - keyboard lock API
        await navigator.keyboard.unlock();
      } catch {
        // ignore errors
      }
    }
  }, []);

  const requestFullscreen = useCallback(async () => {
    console.log("requestFullscreen 1")
    if (!isFullscreenEnabled || !videoElm.current) return;
    console.log("requestFullscreen 2")

    await requestKeyboardLock();
    await pointerLock.requestPointerLock();

    await videoElm.current.requestFullscreen({
      navigationUI: "show",
    });
  }, [isFullscreenEnabled, requestKeyboardLock, pointerLock, videoElm]);

  useEffect(() => {
    console.log("requestFullscreen 0",isFullscreen)
    if (isFullscreen) {
      requestFullscreen();
    }else{
      console.log("not requestFullscreen 0")
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        releaseKeyboardLock();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [releaseKeyboardLock]);

  return {
    requestFullscreen,
    releaseKeyboardLock,
  };
};