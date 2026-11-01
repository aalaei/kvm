import { AnimatePresence, motion, MotionProps } from "framer-motion";
import React from "react";

import { cx } from "@/cva.config";

export type AnimationDirection = "up" | "down" | "left" | "right";
interface SlideAnimationProps {
  direction: AnimationDirection;
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
  onAnimationComplete?: () => void;
}

const SlideAnimation: React.FC<SlideAnimationProps> = ({
                                                         direction,
                                                         children,
                                                         isVisible,
                                                         className = "",
                                                         onAnimationComplete
                                                       }) => {
  const getAnimationVariants = (): MotionProps["variants"] => {
    const distance = 50;
    const sizeValue = 0.0001;
    const variants = {
      up: {
        initial: { y: -distance, opacity: 0, height: sizeValue },
        animate: { y: 0, opacity: 1, height: "auto" },
        exit: { y: -distance, opacity: 0, height: sizeValue }
      },
      down: {
        initial: { y: distance, opacity: 0, height: sizeValue },
        animate: { y: 0, opacity: 1, height: "auto" },
        exit: { y: distance, opacity: 0, height: sizeValue }
      },
      left: {
        initial: { x: -distance, opacity: 0, width: sizeValue },
        animate: { x: 0, opacity: 1, width: "auto" },
        exit: { x: -distance, opacity: 0, width: sizeValue }
      },
      right: {
        initial: { x: distance, opacity: 0, width: sizeValue },
        animate: { x: 0, opacity: 1, width: "auto" },
        exit: { x: distance, opacity: 0, width: sizeValue }
      }
    };

    return {
      initial: variants[direction].initial,
      animate: {
        ...variants[direction].animate,
        transition: {
          duration: 0.3,
          ease: "easeOut",
          width: { duration: 0.3, ease: "easeOut" },
          height: { duration: 0.3, ease: "easeOut" }
        }
      },
      exit: {
        ...variants[direction].exit,
        transition: {
          duration: 0.2,
          ease: "easeIn",
          width: { duration: 0.2, ease: "easeIn" },
          height: { duration: 0.2, ease: "easeIn" }
        }
      }
    };
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={`slide-${direction}`}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={getAnimationVariants()}
          className={cx(className)}
          onAnimationComplete={onAnimationComplete}
          style={{
            willChange: "transform, opacity, width, height",
            overflow: "hidden",
            whiteSpace: "nowrap"
          }}
          layout="size"
          transition={{
            duration: 0.5,
            ease: "easeInOut",
            x: { duration: 0.5, ease: "easeInOut" },
            y: { duration: 0.5, ease: "easeInOut" },
            width: { duration: 0.5, ease: "easeInOut" },
            height: { duration: 0.5, ease: "easeInOut" },
            opacity: { duration: 0.4, ease: "easeInOut" }
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export default SlideAnimation;