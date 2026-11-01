import React, { useRef, useState, useLayoutEffect } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';

import { dark_bd_style } from "@/layout/theme_color";

interface SmartButtonProps extends Omit<ButtonProps, 'children'> {
  text: string;
  maxWidth?: number | string;
}

const useIsOverflow = (deps: any[]) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element) {
      const isOverflowing = element.scrollWidth > element.clientWidth;
      setIsOverflow(isOverflowing);
    }
  }, deps);

  return { ref, isOverflow };
};

const SmartButton: React.FC<SmartButtonProps> = ({
                                                   text,
                                                   maxWidth,
                                                   style,
                                                   ...buttonProps
                                                 }) => {
  const { ref, isOverflow } = useIsOverflow([text, maxWidth, style]);

  const buttonStyle = maxWidth ? { ...style, maxWidth } : style;

  const buttonElement = (
    <Button
      {...buttonProps}
      style={buttonStyle}
      className={dark_bd_style}
    >
      <span
        ref={ref}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          verticalAlign: 'bottom',
        }}
      >
        {text}
      </span>
    </Button>
  );

  return isOverflow ? (
    <Tooltip title={text} mouseEnterDelay={0.5}>
      {buttonElement}
    </Tooltip>
  ) : (
    buttonElement
  );
};

export default SmartButton;