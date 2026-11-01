import { useCallback, useEffect, useState, useRef } from "react";
import { isMobile } from "react-device-detect";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import { useMouseStore, useSettingsStore, useVideoStore, useHidStore } from "@/hooks/stores";

import { usePointerLock } from "./usePointerLock";

export const useMouseEvents = (
  videoElm: React.RefObject<HTMLVideoElement>,
  pointerLock: ReturnType<typeof usePointerLock>,
  touchZoom?: {
    mobileScale: number;
    mobileTx: number;
    mobileTy: number;
    activeTouchPointers: React.MutableRefObject<Map<number, { x: number; y: number }>>;
    lastPanPoint: React.MutableRefObject<{ x: number; y: number } | null>;
  },
  disableTouchClick?: boolean,
  externalButtons = 0
) => {
  const [send] = useJsonRpc();
  const [blockWheelEvent, setBlockWheelEvent] = useState(false);
  const settings = useSettingsStore();
  const { setMousePosition, setMouseMove } = useMouseStore();
  const { width: videoWidth, height: videoHeight } = useVideoStore();
  const isReinitializingGadget = useHidStore(state => state.isReinitializingGadget);
  const touchDragActiveRef = useRef(false);

  const calcDelta = (pos: number) => (Math.abs(pos) < 10 ? pos * 2 : pos);

  const sendRelMouseMovement = useCallback(
    (x: number, y: number, buttons: number, force = false) => {
      if (!force && settings.mouseMode !== "relative") return;
      // Don't send mouse events while reinitializing gadget
      if (isReinitializingGadget) return;
      const dx = calcDelta(x);
      const dy = calcDelta(y);
      send("relMouseReport", { dx, dy, buttons });
      setMouseMove({ x, y, buttons });
    },
    [send, setMouseMove, settings.mouseMode, isReinitializingGadget],
  );

  const sendAbsMouseMovement = useCallback(
    (x: number, y: number, buttons: number) => {
      if (settings.mouseMode !== "absolute") return;
      // Don't send mouse events while reinitializing gadget
      if (isReinitializingGadget) return;
      send("absMouseReport", { x, y, buttons });
      setMousePosition(x, y);
    },
    [send, setMousePosition, settings.mouseMode, isReinitializingGadget],
  );

  const sendVirtualRelativeMovement = useCallback(
    (x: number, y: number, buttons = 0) => {
      sendRelMouseMovement(x, y, buttons, true);
    },
    [sendRelMouseMovement],
  );

  const relMouseMoveHandler = useCallback(
    (e: MouseEvent) => {
      const pt = (e as unknown as PointerEvent).pointerType as unknown as string;
      if (pt === "touch") {
        if (touchZoom) {
            const touchCount = touchZoom.activeTouchPointers.current.size;
            if (touchCount >= 2) return;
            if (touchZoom.mobileScale > 1 && touchZoom.lastPanPoint.current) return;
        }
      }
      
      if(isMobile){
        e.preventDefault();
      }
      if (settings.mouseMode !== "relative") return;
      if (!pointerLock.isPointerLockActive && pointerLock.isPointerLockPossible) return;

      const { buttons } = e;
      sendRelMouseMovement(e.movementX, e.movementY, buttons);
    },
    [pointerLock.isPointerLockActive, pointerLock.isPointerLockPossible, sendRelMouseMovement, settings.mouseMode, touchZoom],
  );

  const absMouseMoveHandler = useCallback(
    (e: MouseEvent) => {
      const pt = (e as unknown as PointerEvent).pointerType as unknown as string;
      const pointerEvent = e as unknown as PointerEvent;
      const eventType = pointerEvent.type;
      if (pt === "touch") {
        if (touchZoom) {
          const touchCount = touchZoom.activeTouchPointers.current.size;
          if (touchCount >= 2) {
            if (eventType === "pointerup" || eventType === "pointercancel") {
              touchDragActiveRef.current = false;
            }
            return;
          }
        }
      }

      //e.stopPropagation();
      if(isMobile){
        e.preventDefault();
      }

      const videoElmRefValue = videoElm.current;
      if (!videoElmRefValue) return;
      if (!videoWidth || !videoHeight) return;
      if (settings.mouseMode !== "absolute") return;

      const rect = videoElmRefValue.getBoundingClientRect();
      const displayedWidth = rect.width;
      const displayedHeight = rect.height;
      if (!displayedWidth || !displayedHeight) return;

      const videoElementAspectRatio = displayedWidth / displayedHeight;
      const videoStreamAspectRatio = videoWidth / videoHeight;

      let effectiveWidth = displayedWidth;
      let effectiveHeight = displayedHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (videoElementAspectRatio > videoStreamAspectRatio) {
        effectiveWidth = displayedHeight * videoStreamAspectRatio;
        offsetX = (displayedWidth - effectiveWidth) / 2;
      } else if (videoElementAspectRatio < videoStreamAspectRatio) {
        effectiveHeight = displayedWidth / videoStreamAspectRatio;
        offsetY = (displayedHeight - effectiveHeight) / 2;
      }

      // Use visual coordinates relative to the video element's bounding rect
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const inputOffsetX = localX;
      const inputOffsetY = localY;

      const clampedX = Math.min(Math.max(offsetX, inputOffsetX), offsetX + effectiveWidth);
      const clampedY = Math.min(Math.max(offsetY, inputOffsetY), offsetY + effectiveHeight);

      const relativeX = (clampedX - offsetX) / effectiveWidth;
      const relativeY = (clampedY - offsetY) / effectiveHeight;

      // transform to HID absolute coordinates (0-32767 range)
      const x = Math.round(relativeX * 32767);
      const y = Math.round(relativeY * 32767);

      let buttons = e.buttons;

      if (pt === "touch") {
        if (eventType === "pointerdown") {
          touchDragActiveRef.current = !disableTouchClick;
        }
        if (eventType === "pointerup" || eventType === "pointercancel") {
          buttons = 0;
          touchDragActiveRef.current = false;
        } else {
          buttons = touchDragActiveRef.current ? 1 : 0;
        }
      }

      buttons |= externalButtons;

      sendAbsMouseMovement(x, y, buttons);
    },
    [settings.mouseMode, videoElm, videoWidth, videoHeight, sendAbsMouseMovement, touchZoom, disableTouchClick, externalButtons],
  );


  const mouseWheelHandler = useCallback(
    (e: WheelEvent) => {
      // Don't send wheel events while reinitializing gadget
      if (isReinitializingGadget) return;
      // e.stopPropagation();
      // e.preventDefault();
      if (settings.scrollThrottling && blockWheelEvent) {
        return;
      }

      const isAccel = Math.abs(e.deltaY) >= 100;
      const accelScrollValue = e.deltaY / 100;
      const noAccelScrollValue = Math.sign(e.deltaY);
      const scrollValue = isAccel ? accelScrollValue : noAccelScrollValue;

      const clampedScrollValue = Math.max(-127, Math.min(127, scrollValue));
      const invertedScrollValue = -clampedScrollValue;

      send("wheelReport", { wheelY: invertedScrollValue });

      if (settings.scrollThrottling && !blockWheelEvent) {
        setBlockWheelEvent(true);
        setTimeout(() => setBlockWheelEvent(false), settings.scrollThrottling);
      }
    },
    [send, blockWheelEvent, settings, isReinitializingGadget],
  );

  const resetMousePosition = useCallback(() => {
    sendAbsMouseMovement(0, 0, 0);
  }, [sendAbsMouseMovement]);

  const isRelativeMouseMode = (settings.mouseMode === "relative");
  const mouseMoveHandler = isRelativeMouseMode ? relMouseMoveHandler : absMouseMoveHandler;
  const handlerRef = useRef(mouseMoveHandler);

  useEffect(() => {
    handlerRef.current = mouseMoveHandler;
  }, [mouseMoveHandler]);

  const setupMouseEvents = useCallback(() => {
    const videoElmRefValue = videoElm.current;
    if (!videoElmRefValue) return;

    const abortController = new AbortController();
    const signal = abortController.signal;

    const eventHandler = (e: Event) => {
      if (handlerRef.current) {
        handlerRef.current(e as any);
      }
    };

    videoElmRefValue.addEventListener("mousemove", eventHandler, { signal });
    videoElmRefValue.addEventListener("pointermove", eventHandler, { signal });
    videoElmRefValue.addEventListener("pointerdown", eventHandler, { signal });
    videoElmRefValue.addEventListener("pointerup", eventHandler, { signal });
    videoElmRefValue.addEventListener("pointercancel", eventHandler, { signal });
    videoElmRefValue.addEventListener("wheel", mouseWheelHandler, {
      signal,
      passive: true,
    });

    if (isRelativeMouseMode) {
      videoElmRefValue.addEventListener("click",
        () => {
          if (pointerLock.isPointerLockPossible && !pointerLock.isPointerLockActive && !document.pointerLockElement) {
            pointerLock.requestPointerLock();
          }
        },
        { signal },
      );
    } else {
      window.addEventListener("blur", resetMousePosition, { signal });
      document.addEventListener("visibilitychange", resetMousePosition, { signal });
    }

    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    videoElmRefValue.addEventListener("contextmenu", preventContextMenu, { signal });

    return () => {
      abortController.abort();
    };
  }, [
    videoElm,
    settings.mouseMode,
    isRelativeMouseMode,
    // Removed relMouseMoveHandler and absMouseMoveHandler from dependencies to prevent re-binding
    mouseWheelHandler,
    pointerLock,
    resetMousePosition
  ]);

  return {
    setupMouseEvents,
    sendVirtualRelativeMovement,
  };
};
