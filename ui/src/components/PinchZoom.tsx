import React, { useRef, useEffect, useState, useCallback } from "react";

interface PinchZoomProps {
  children: React.ReactElement;
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  onScaleChange?: (scale: number) => void;
}



const PinchZoom: React.FC<PinchZoomProps> = ({
  children,
  minScale = 0.5,
  maxScale = 3,
  initialScale = 1,
  onScaleChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(initialScale);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const touchStateRef = useRef({
    isDragging: false,
    isPinching: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    initialDistance: 0,
    initialScale: initialScale,
    lastTouchTime: 0,
    touchCount: 0
  });

  const clampPosition = useCallback((x: number, y: number, currentScale: number) => {
    if (!containerRef.current || !contentRef.current) return { x: 0, y: 0 };

    const containerRect = containerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();

    const scaledWidth = contentRect.width * currentScale;
    const scaledHeight = contentRect.height * currentScale;

    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2 / currentScale);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2 / currentScale);

    if (scaledWidth <= containerRect.width) {
      x = 0;
    } else {
      x = Math.max(-maxX, Math.min(maxX, x));
    }

    if (scaledHeight <= containerRect.height) {
      y = 0;
    } else {
      y = Math.max(-maxY, Math.min(maxY, y));
    }

    return { x, y };
  }, []);

  const getDistance = useCallback((touch1: Touch, touch2: Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touches = e.touches;
    const state = touchStateRef.current;
    
    state.touchCount = touches.length;
    state.lastTouchTime = Date.now();

    if (touches.length === 1) {
      state.isDragging = true;
      state.startX = touches[0].clientX - position.x;
      state.startY = touches[0].clientY - position.y;
      state.lastX = touches[0].clientX;
      state.lastY = touches[0].clientY;
    } else if (touches.length === 2) {
      state.isPinching = true;
      state.isDragging = false;
      state.initialDistance = getDistance(touches[0], touches[1]);
      state.initialScale = scale;
    }
  }, [position, scale, getDistance]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touches = e.touches;
    const state = touchStateRef.current;
    
    if (state.isDragging && touches.length === 1) {
      const touch = touches[0];
      const deltaX = touch.clientX - state.lastX;
      const deltaY = touch.clientY - state.lastY;
      
      const newX = position.x + deltaX;
      const newY = position.y + deltaY;
      
      const clamped = clampPosition(newX, newY, scale);
      setPosition(clamped);
      
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;
    } else if (state.isPinching && touches.length === 2) {
      const currentDistance = getDistance(touches[0], touches[1]);
      const scaleFactor = currentDistance / state.initialDistance;
      let newScale = state.initialScale * scaleFactor;
      
      newScale = Math.max(minScale, Math.min(maxScale, newScale));
      
      setScale(newScale);
      onScaleChange?.(newScale);
    }
  }, [position, scale, clampPosition, getDistance, minScale, maxScale, onScaleChange]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const state = touchStateRef.current;
    const currentTime = Date.now();
    
    if (state.touchCount === 1 && currentTime - state.lastTouchTime < 300) {
      const newScale = scale === initialScale ? 1.5 : initialScale;
      setScale(newScale);
      setPosition({ x: 0, y: 0 });
      onScaleChange?.(newScale);
    }
    
    state.isDragging = false;
    state.isPinching = false;
    state.touchCount = e.touches.length;
  }, [scale, initialScale, onScaleChange]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlay.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      overlay.removeEventListener('touchstart', handleTouchStart);
      overlay.removeEventListener('touchmove', handleTouchMove);
      overlay.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={containerRef}
      style={{
        touchAction: "none",
        width: "100%",
        height: "400px",
        overflow: "hidden",
        position: "relative",
        cursor: scale > 1 ? "grab" : "default",
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: "center center",
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transition: "transform 0.1s ease-out",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>

      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 10000,
          backgroundColor: "rgba(0,255,0,0.5)",
          cursor: scale > 1 ? "grab" : "default",
        }}
      />
    </div>
  );
};

export default PinchZoom;