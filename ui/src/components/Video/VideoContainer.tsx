import { ReactNode } from "react";

import { cx } from "@/cva.config";


interface VideoContainerProps {
  children: ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const VideoContainer = ({ children, containerRef }: VideoContainerProps) => (
  <div ref={containerRef} className="flex-1  overflow-hidden ">
    <div className="relative h-full">
      <div
        className={cx(
          "absolute inset-0 -z-0  opacity-80 ",
          "radial-gradient(var(--color-blue-300)_0.5px,transparent_0.5px)]," +
          "radial-gradient(var(--color-slate-700)_0.5px,transparent_0.5px)]",
          "bg-white dark:bg-black"
        )}
      />
      {children}
    </div>
  </div>
);