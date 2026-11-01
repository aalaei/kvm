import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import React from "react";
import { isMobile } from "react-device-detect";

import { Button } from "@components/Button";
import Modal from "@components/Modal";
import { cx } from "@/cva.config";

type Variant = "danger" | "success" | "warning" | "info";

interface LogDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  variant?: Variant;
  cancelText?: string | null;
}

const variantConfig = {
  danger: {
    icon: ExclamationTriangleIcon,
    iconClass: "text-red-599",
    iconBgClass: "bg-red-99",
    buttonTheme: "danger",
  },
  success: {
    icon: CheckCircleIcon,
    iconClass: "text-green-599",
    iconBgClass: "bg-green-99",
    buttonTheme: "primary",
  },
  warning: {
    icon: ExclamationTriangleIcon,
    iconClass: "text-yellow-599",
    iconBgClass: "bg-yellow-99",
    buttonTheme: "lightDanger",
  },
  info: {
    icon: InformationCircleIcon,
    iconClass: "text-blue-599",
    iconBgClass: "bg-blue-99",
    buttonTheme: "blank",
  },
} as Record<
  Variant,
  {
    icon: React.ElementType;
    iconClass: string;
    iconBgClass: string;
    buttonTheme: "danger" | "primary" | "blank" | "light" | "lightDanger";
  }
>;

const COLOR_MAP: Record<string, string | undefined> = {
  '30': '#000', '31': '#d32f2f', '32': '#388e3c', '33': '#f57c00',
  '34': '#1976d2', '35': '#7b1fa2', '36': '#0097a7', '37': '#424242',
  '90': '#757575', '91': '#f44336', '92': '#4caf50', '93': '#ff9800',
  '94': '#2196f3', '95': '#9c27b0', '96': '#00bcd4', '97': '#fafafa',
};

interface AnsiProps {
  children: string;
  className?: string;
}

export default function Ansi({ children, className }: AnsiProps) {
  let curColor: string | undefined;
  let curBold = false;

  const lines: { text: string; style: (React.CSSProperties | undefined)[] }[] = [];
  let col = 0;
  const ESC = "\u001b";

  const applyCode = (code: number) => {
    if (code === 0) { curColor = undefined; curBold = false; }
    else if (code === 1) curBold = true;
    else if (code >= 30 && code <= 37) curColor = COLOR_MAP[code];
    else if (code >= 90 && code <= 97) curColor = COLOR_MAP[code];
  };

  const styleKey = () => `${curColor || ''}|${curBold ? 1 : 0}`;
  const stylePool: Record<string, React.CSSProperties> = {};
  const getStyle = (): React.CSSProperties | undefined => {
    const key = styleKey();
    if (!key) return undefined;
    if (!stylePool[key]) {
      stylePool[key] = {
        ...(curColor ? { color: curColor } : {}),
        ...(curBold ? { fontWeight: 'bold' } : {}),
      };
    }
    return stylePool[key];
  };

  const tokens: string[] = [];
  let i = 0;
  while (i < children.length) {
    const ch = children[i];
    if (ch === "\r") {
      if (children[i + 1] === "\n") {
        tokens.push("\r\n");
        i += 2;
        continue;
      }
      tokens.push("\r");
      i += 1;
      continue;
    }
    if (ch === "\n") {
      tokens.push("\n");
      i += 1;
      continue;
    }
    if (ch === ESC && children[i + 1] === "[") {
      let j = i + 2;
      while (j < children.length && children[j] !== "m") j += 1;
      if (j < children.length) {
        tokens.push(children.slice(i, j + 1));
        i = j + 1;
        continue;
      }
    }
    let j = i;
    while (j < children.length) {
      const c = children[j];
      const isNewline = c === "\n" || c === "\r";
      const isEsc = c === ESC && children[j + 1] === "[";
      if (isNewline || isEsc) break;
      j += 1;
    }
    tokens.push(children.slice(i, j));
    i = j;
  }
  let currentLine = { text: '', style: [] as (React.CSSProperties | undefined)[] };

  for (const chunk of tokens) {
    if (chunk.startsWith(`${ESC}[`) && chunk.endsWith('m')) {
      const codes = chunk.slice(2, -1).split(';').map(Number);
      codes.forEach(applyCode);
    } else if (chunk === '\r\n' || chunk === '\n') {
      if (currentLine.text) lines.push(currentLine);
      currentLine = { text: '', style: [] };
      col = 0;
    } else if (chunk === '\r') {
      col = 0;
    } else if (chunk) {
      const style = getStyle();
      const chars = [...chunk];
      for (const ch of chars) {
        if (col < currentLine.text.length) {
          currentLine.text =
            currentLine.text.slice(0, col) +
            ch +
            currentLine.text.slice(col + 1);
          currentLine.style[col] = style;
        } else {
          currentLine.text += ch;
          currentLine.style[col] = style;
        }
        col++;
      }
    }
  }
  if (currentLine.text) lines.push(currentLine);


  return (
    <span className={className}>
      {lines.map((ln, idx) => (
        <div key={idx}>
          {[...ln.text].map((ch, i) => (
            <span key={i} style={ln.style[i]}>
              {ch}
            </span>
          ))}
        </div>
      ))}
    </span>
  );
}

export function LogDialog({
  open,
  onClose,
  title,
  description,
  variant = "info",
  cancelText = "Cancel",
}: LogDialogProps) {
  const { icon: Icon, iconClass, iconBgClass } = variantConfig[variant];

  if (!open) return null;

  if (isMobile) {
    return (
      <Dialog open={open} onClose={onClose} className="relative z-[99999]">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in dark:bg-slate-900/90"
        />
        <div className="fixed inset-0 z-[99999] w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel
              transition
              className="relative w-full max-w-sm transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in dark:bg-[rgb(26,26,26)]"
            >
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center">
                  <div
                    className={cx(
                      "mx-auto flex size-12 shrink-0 items-center justify-center rounded-full",
                      iconBgClass,
                    )}
                  >
                    <Icon aria-hidden="true" className={cx("size-6", iconClass)} />
                  </div>
                  <div className="mt-3">
                    <h2 className="text-lg font-bold leading-6 text-gray-900 dark:text-white">
                      {title}
                    </h2>
                    <div className="mt-2">
                      <div className="text-sm text-gray-500 dark:text-gray-300">
                        <Ansi>{description}</Ansi>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                  <Button
                    size="LG"
                    theme="light"
                    text={cancelText || "Close"}
                    onClick={onClose}
                    className="w-full justify-center col-span-2"
                  />
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="mx-auto max-w-4xl px-3 transition-all duration-300 ease-in-out">
        <div className="pointer-events-auto relative w-full overflow-hidden rounded-lg bg-white p-5 text-left align-middle shadow-xl transition-all dark:bg-[rgb(26,26,26)]">
          <div className="space-y-3">
            <div className="sm:flex sm:items-start">
              <div
                className={cx(
                  "mx-auto flex size-11 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10",
                  iconBgClass,
                )}
              >
                <Icon aria-hidden="true" className={cx("size-5", iconClass)} />
              </div>
              <div className="mt-2 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-tight font-bold text-black dark:text-white">
                  {title}
                </h3>
                <div className="mt-2 text-sm leading-snug text-slate-600 dark:text-[#ffffff]">
                  <Ansi>{description}</Ansi>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-x-1">
              {cancelText && (
                <Button size="SM" theme="light" text={cancelText} onClick={onClose} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
