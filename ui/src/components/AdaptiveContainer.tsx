import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AdaptiveContainerProps {
  children: React.ReactNode;
  minHeight?: number | string;
  onKeyboardShow?: () => void;
  onKeyboardHide?: () => void;
  style?: React.CSSProperties;
  differenceRange?: number;
}

const AdaptiveContainer: React.FC<AdaptiveContainerProps> = ({
                                                               children,
                                                               minHeight = 0,
                                                               onKeyboardShow,
                                                               onKeyboardHide,
                                                               style = {},
                                                               differenceRange = 50
                                                             }) => {
  const [containerHeight, setContainerHeight] = useState<string | number>('100%');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const originalHeight = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const initHeight = useCallback(() => {
    originalHeight.current = document.documentElement.clientHeight || document.body.clientHeight;
    setContainerHeight('100%');
  }, []);

  const handleResize = useCallback(() => {
    const currentHeight = document.documentElement.clientHeight || document.body.clientHeight;
    if (Math.abs(originalHeight.current - currentHeight) > differenceRange) {
      if (currentHeight < originalHeight.current) {
        setContainerHeight(currentHeight);
        setIsKeyboardVisible(true);
        onKeyboardShow?.();
        console.log("currentHeight = ",currentHeight)
      }
    } else {

      if (isKeyboardVisible) {
        setContainerHeight('100%');
        setIsKeyboardVisible(false);
        onKeyboardHide?.();
      }
      originalHeight.current = currentHeight;
    }
  }, [differenceRange, isKeyboardVisible, onKeyboardShow, onKeyboardHide]);

  useEffect(() => {
    initHeight();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [initHeight, handleResize]);

  const containerStyle: React.CSSProperties = {
    height: containerHeight,
    minHeight,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch', 
    transition: 'height 0.3s ease',
    ...style
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className="adaptive-container"
    >
      {children}
    </div>
  );
};

export default AdaptiveContainer;