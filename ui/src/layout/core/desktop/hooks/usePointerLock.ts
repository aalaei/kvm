import { useCallback, useEffect, useState } from "react";

import { useSettingsStore } from "@/hooks/stores";

export const usePointerLock = (videoElm: React.RefObject<HTMLVideoElement>) => {
  const [isPointerLockActive, setIsPointerLockActive] = useState(false);
  const settings = useSettingsStore();
  const isPointerLockPossible = window.location.protocol === "https:" || window.location.hostname === "localhost";

  const requestPointerLock = useCallback(async () => {
    if (!isPointerLockPossible || !videoElm.current || document.pointerLockElement || settings.mouseMode !== "relative") {
      return;
    }

    try {
      await videoElm.current.requestPointerLock();
    } catch (err) {
      console.warn("[pointer-lock] requestPointerLock failed:", err);
    }
  }, [isPointerLockPossible, settings.mouseMode, videoElm]);

  useEffect(() => {
    if (!isPointerLockPossible || !videoElm.current) return;

    const handlePointerLockChange = () => {
      setIsPointerLockActive(!!document.pointerLockElement);
    };

    handlePointerLockChange();
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => document.removeEventListener("pointerlockchange", handlePointerLockChange);
  }, [isPointerLockPossible, videoElm]);

  return {
    isPointerLockActive,
    isPointerLockPossible,
    requestPointerLock,
  };
};
