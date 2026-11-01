import React, { useState, useEffect, useRef, ReactNode, CSSProperties } from 'react';
import { createStyles } from 'antd-style';

import { dark_bg2_style } from "@/layout/theme_color";

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  bottomOffset?: number;
  height?: number | string;
  mask?: boolean;
  maskClosable?: boolean;
  style?: CSSProperties;
  className?: string;
  maskStyle?: CSSProperties;
  title?: ReactNode;
  closable?: boolean;
  closeIcon?: ReactNode;
  afterOpen?: () => void;
  afterClose?: () => void;
  placement?: 'bottom' | 'right' | 'left' | 'top';
  width?: number | string;
  getContainer?: HTMLElement | false;
}

const useStyles = createStyles(({ css }) => ({
  drawerContainer: css`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    pointer-events: none;
    overflow: hidden;
  `,
  drawerContainerAbsolute: css`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    pointer-events: none;
    overflow: hidden;
  `,
  drawerMask: css`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.45);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: auto;
  `,
  drawerMaskVisible: css`
    opacity: 1;
  `,
  drawerContentWrapper: css`
    position: absolute;
    background: #fff;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
    transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
  `,
  // Bottom specific styles
  drawerWrapperBottom: css`
    left: 0;
    width: 100%;
    transform: translateY(100%);
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
  `,
  drawerOpenBottom: css`
    transform: translateY(0);
  `,
  // Right specific styles
  drawerWrapperRight: css`
    right: 0;
    top: 0;
    height: 100%;
    transform: translateX(100%);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  `,
  drawerOpenRight: css`
    transform: translateX(0);
  `,
  // Left specific styles
  drawerWrapperLeft: css`
    left: 0;
    top: 0;
    height: 100%;
    transform: translateX(-100%);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  `,
  drawerOpenLeft: css`
    transform: translateX(0);
  `,
  // Top specific styles
  drawerWrapperTop: css`
    left: 0;
    top: 0;
    width: 100%;
    transform: translateY(-100%);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  `,
  drawerOpenTop: css`
    transform: translateY(0);
  `,
  drawerHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 4px;
    border-bottom: 1px solid #f0f0f0;
    color: rgba(0, 0, 0, 0.85);
    background: #fff;
    border-radius: 8px 8px 0 0;
    flex-shrink: 0;
  `,
  drawerTitle: css`
    margin: 0;
    font-weight: 500;
    font-size: 16px;
    line-height: 22px;
    flex: 1;
  `,
  drawerClose: css`
    line-height: 1;
    text-align: center;
    text-transform: none;
    text-decoration: none;
    background: transparent;
    border: 0;
    outline: 0;
    cursor: pointer;
    transition: color 0.3s;
    padding: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover: {
      color: rgba(0, 0, 0, 0.75);
    }
  `,
  drawerBody: css`
    padding-left: 4px;
    padding-right: 4px;
    font-size: 14px;
    line-height: 1.5715;
    word-wrap: break-word;
    height: calc(100% - 54px);
  `,
}));

// 抽屉组件
const Drawer: React.FC<DrawerProps> = ({
                                         visible = false,
                                         onClose,
                                         children,
                                         bottomOffset = 0,
                                         height = 378,
                                         mask = true,
                                         maskClosable = true,
                                         style = {},
                                         className = '',
                                         maskStyle = {},
                                         title,
                                         closable = true,
                                         closeIcon,
                                         afterOpen,
                                         afterClose,
                                         placement = 'bottom',
                                         width = 378,
                                         getContainer
                                       }) => {
  const { styles } = useStyles();
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      timerRef.current = setTimeout(() => {
        setIsOpen(true);
        afterOpen?.();
      }, 10);
    } else {
      setIsOpen(false);
      timerRef.current = setTimeout(() => {
        setIsMounted(false);
        afterClose?.();
      }, 300);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, afterOpen, afterClose]);

  const handleMaskClick = () => {
    if (maskClosable) {
      onClose();
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleClose = () => {
    onClose();
  };

  const getPlacementClass = () => {
    switch (placement) {
      case 'left':
        return `${styles.drawerWrapperLeft} ${isOpen ? styles.drawerOpenLeft : ''}`;
      case 'right':
        return `${styles.drawerWrapperRight} ${isOpen ? styles.drawerOpenRight : ''}`;
      case 'top':
        return `${styles.drawerWrapperTop} ${isOpen ? styles.drawerOpenTop : ''}`;
      case 'bottom':
      default:
        return `${styles.drawerWrapperBottom} ${isOpen ? styles.drawerOpenBottom : ''}`;
    }
  };

  const getDrawerStyle = (): CSSProperties => {
    const baseStyle: CSSProperties = {};
    
    if (placement === 'left' || placement === 'right') {
      baseStyle.width = typeof width === 'number' ? `${width}px` : width;
    } else {
      baseStyle.height = typeof height === 'number' ? `${height}px` : height;
      if (placement === 'bottom') {
        baseStyle.bottom = `${bottomOffset}px`;
      }
    }
    
    return baseStyle;
  };

  if (!isMounted && !visible) {
    return null;
  }

  const getContainerStyle = (): CSSProperties => {
    if (getContainer === false) {
       return { position: 'absolute' };
    }
    return {};
  };

  return (
    <div className={`${getContainer === false ? styles.drawerContainerAbsolute : styles.drawerContainer} ${className || ''}`} style={{...style, ...getContainerStyle()}}>
      {mask && (
        <div
          className={`${styles.drawerMask} ${isOpen ? styles.drawerMaskVisible : ''}`}
          style={maskStyle}
          onClick={handleMaskClick}
        />
      )}
      <div
        ref={drawerRef}
        className={`${styles.drawerContentWrapper} ${getPlacementClass()} ${dark_bg2_style}`}
        style={getDrawerStyle()}
        onClick={handleContentClick}
      >
        <div className={`${styles.drawerHeader} ${dark_bg2_style}`}>
          <div className={styles.drawerTitle}>{title}</div>
          {closable && (
            <button type="button" onClick={handleClose} className={styles.drawerClose}>
              {closeIcon || <span className={styles.drawerClose}>×</span>}
            </button>
          )}
        </div>
        <div className={styles.drawerBody}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Drawer;