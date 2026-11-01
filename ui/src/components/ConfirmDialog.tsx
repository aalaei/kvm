import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { isMobile } from "react-device-detect";
import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import React from "react";

import { Button } from "@components/Button";
import Modal from "@components/Modal";
import { cx } from "@/cva.config";

type Variant = "danger" | "success" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  variant?: Variant;
  confirmText?: string;
  cancelText?: string | null;
  onConfirm: () => void;
  isConfirming?: boolean;
}

const variantConfig = {
  danger: {
    icon: ExclamationTriangleIcon,
    iconClass: "text-red-600",
    iconBgClass: "bg-red-100",
    buttonTheme: "danger",
  },
  success: {
    icon: CheckCircleIcon,
    iconClass: "text-green-600",
    iconBgClass: "bg-green-100",
    buttonTheme: "primary",
  },
  warning: {
    icon: ExclamationTriangleIcon,
    iconClass: "text-yellow-600",
    iconBgClass: "bg-yellow-100",
    buttonTheme: "lightDanger",
  },
  info: {
    icon: InformationCircleIcon,
    iconClass: "text-blue-600",
    iconBgClass: "bg-blue-100",
    buttonTheme: "primary",
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

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = "info",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  isConfirming = false,
}: ConfirmDialogProps) {
  const { icon: Icon, iconClass, iconBgClass, buttonTheme } = variantConfig[variant];

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
                        {description}
                      </div>
                    </div>
                    {children}
                  </div>
                </div>
                <div className={cx("mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3", isConfirming && "pointer-events-none")}>
                  <Button
                    size="LG"
                    theme={buttonTheme}
                    text={isConfirming ? `${confirmText}...` : confirmText}
                    onClick={onConfirm}
                    disabled={isConfirming}
                    className="w-full justify-center"
                  />
                  {cancelText && (
                    <Button
                      size="LG"
                      theme="light"
                      text={cancelText}
                      onClick={onClose}
                      className="mt-3 w-full justify-center sm:mt-0"
                    />
                  )}
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
      <div className="mx-auto max-w-xl px-4 transition-all duration-300 ease-in-out">
        <div className="pointer-events-auto relative w-full overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-[rgb(26,26,26)]">
          <div className="space-y-4">
            <div className="sm:flex sm:items-start">
              <div
                className={cx(
                  "mx-auto flex size-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10",
                  iconBgClass,
                )}
              >
                <Icon aria-hidden="true" className={cx("size-6", iconClass)} />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h2 className="text-lg leading-tight font-bold text-black dark:text-white">
                  {title}
                </h2>
                <div className="mt-2 text-sm leading-snug text-slate-600 dark:text-[#ffffff]">
                  {description}
                </div>
                {children}
              </div>
            </div>

            <div className={cx("flex justify-end gap-x-2", isConfirming && "pointer-events-none")}>
              {cancelText && (
                <Button size="SM" theme="light" text={cancelText} onClick={onClose} />
              )}
              <Button
                size="SM"
                theme={buttonTheme}
                text={isConfirming ? `${confirmText}...` : confirmText}
                onClick={onConfirm}
                disabled={isConfirming}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
