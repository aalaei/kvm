import { useEffect, useRef, useState } from "react";

export const useTouchZoom = (
  containerRef: React.RefObject<HTMLDivElement>,
  gestureEnabled = true,
) => {
  const [mobileScale, setMobileScale] = useState(1);
  const [mobileTx, setMobileTx] = useState(0);
  const [mobileTy, setMobileTy] = useState(0);
  const activeTouchPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistance = useRef<number | null>(null);
  const initialPinchScale = useRef<number>(1);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const lastTapAt = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const abortController = new AbortController();
    const signal = abortController.signal;
    const isPointInVideo = (x: number, y: number) => {
      const video = el.querySelector("video") as HTMLVideoElement | null;
      if (!video) return false;
      const vRect = video.getBoundingClientRect();
      return x >= vRect.left && x <= vRect.right && y >= vRect.top && y <= vRect.bottom;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      activeTouchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gestureEnabled) return;
      let shouldHandleLocalGesture = false;

      if (activeTouchPointers.current.size === 1) {
        const now = Date.now();
        const isInVideo = isPointInVideo(e.clientX, e.clientY);
        if (!isInVideo) {
          if (now - lastTapAt.current < 300) {
            setMobileScale(1);
            setMobileTx(0);
            setMobileTy(0);
          }
          shouldHandleLocalGesture = true;
        }
        lastTapAt.current = now;
        if (mobileScale > 1) {
          lastPanPoint.current = { x: e.clientX, y: e.clientY };
          shouldHandleLocalGesture = true;
        } else {
          lastPanPoint.current = null;
        }
      } else if (activeTouchPointers.current.size === 2) {
        const pts = Array.from(activeTouchPointers.current.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialPinchDistance.current = d;
        initialPinchScale.current = mobileScale;
        shouldHandleLocalGesture = true;
      }

      if (shouldHandleLocalGesture) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const prev = activeTouchPointers.current.get(e.pointerId);
      activeTouchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gestureEnabled) return;
      const pts = Array.from(activeTouchPointers.current.values());
      let shouldHandleLocalGesture = false;

      if (pts.length === 2 && initialPinchDistance.current) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const factor = d / initialPinchDistance.current;
        const next = Math.max(1, Math.min(4, initialPinchScale.current * factor));
        setMobileScale(next);
        shouldHandleLocalGesture = true;
      } else if (pts.length === 1 && mobileScale > 1 && lastPanPoint.current && prev) {
        const dx = e.clientX - lastPanPoint.current.x;
        const dy = e.clientY - lastPanPoint.current.y;
        lastPanPoint.current = { x: e.clientX, y: e.clientY };
        setMobileTx(v => v + dx);
        setMobileTy(v => v + dy);
        shouldHandleLocalGesture = true;
      }

      if (shouldHandleLocalGesture) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const wasHandlingLocalGesture = gestureEnabled && (initialPinchDistance.current !== null || mobileScale > 1);
      activeTouchPointers.current.delete(e.pointerId);
      if (activeTouchPointers.current.size < 2) {
        initialPinchDistance.current = null;
      }
      if (activeTouchPointers.current.size === 0) {
        lastPanPoint.current = null;
      }

      if (wasHandlingLocalGesture) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { signal });
    el.addEventListener("pointermove", onPointerMove, { signal });
    el.addEventListener("pointerup", onPointerUp, { signal });
    el.addEventListener("pointercancel", onPointerUp, { signal });

    return () => abortController.abort();
  }, [mobileScale, containerRef, gestureEnabled]);

  const resetTransform = () => {
    initialPinchDistance.current = null;
    lastPanPoint.current = null;
    setMobileScale(1);
    setMobileTx(0);
    setMobileTy(0);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    const maxX = (cw * (mobileScale - 1)) / 2;
    const maxY = (ch * (mobileScale - 1)) / 2;
    setMobileTx(x => Math.max(-maxX, Math.min(maxX, x)));
    setMobileTy(y => Math.max(-maxY, Math.min(maxY, y)));
  }, [mobileScale, containerRef]);

  return {
    mobileScale,
    mobileTx,
    mobileTy,
    activeTouchPointers,
    lastPanPoint,
    resetTransform,
  };
};
