import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useMemo, forwardRef, useEffect, useCallback } from "react";
import {
  LuArrowUpFromLine,
  LuCheckCheck,
  LuLink,
} from "react-icons/lu";
import { useClose } from "@headlessui/react";
import { useLocation } from "react-router-dom";
import IMGSvg from "@assets/second/IMG.svg?react";
import { Button } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import { isMobile } from "react-device-detect";

import Card from "@components/Card";
import { formatters } from "@/utils";
import { RemoteVirtualMediaState, useMountMediaStore, useRTCStore, useUsbEpModeStore } from "@/hooks/stores";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { UsbDeviceConfig } from "@components/UsbEpModeSetting";

const MediaMountedDetails = forwardRef<HTMLDivElement, {
  remoteVirtualMediaState: RemoteVirtualMediaState;
  bytesSentPerSecond: number | null;
  onUnmount: () => void;
}>(({ remoteVirtualMediaState, bytesSentPerSecond, onUnmount }, ref) => {
  const { $at } = useReactAt();
  const { source, filename, size, url, path, mode } = remoteVirtualMediaState;

  const renderMediaContent = () => {
    switch (source) {
      case "WebRTC":
        return (
          <>
            <div className="space-y-1">
              <div className="flex items-center gap-x-2">
                <LuCheckCheck className="h-5 text-green-500" />
                <h3 className="text-base font-semibold text-black dark:text-white">
                  Streaming from Browser
                </h3>
              </div>
              <Card className="w-auto px-2 py-1">
                <div className="w-full truncate text-sm text-black dark:text-white">
                  {formatters.truncateMiddle(filename, 50)}
                </div>
              </Card>
            </div>
            <div className="my-2 flex flex-col items-center gap-y-2">
              <div className="w-full text-sm text-slate-900 dark:text-slate-100">
                <div className="flex items-center justify-between">
                  <span>{formatters.bytes(size ?? 0)}</span>
                  <div className="flex items-center gap-x-1">
                    <LuArrowUpFromLine
                      className="h-4 text-blue-700 dark:text-blue-500"
                      strokeWidth={2}
                    />
                    <span>
                      {bytesSentPerSecond !== null
                        ? `${formatters.bytes(bytesSentPerSecond)}/s`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      case "HTTP":
        return (
          <div className="">
            <div className="mb-0 inline-block">
              <Card>
                <div className="p-1">
                  <LuLink className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-500" />
                </div>
              </Card>
            </div>
            <h3 className="text-base font-semibold text-black dark:text-white">
              Streaming from URL
            </h3>
            <p className="truncate text-sm text-slate-900 dark:text-slate-100">
              {formatters.truncateMiddle(url, 55)}
            </p>
            <p className="text-sm text-slate-900 dark:text-slate-100">
              {formatters.truncateMiddle(filename, 30)}
            </p>
            <p className="text-sm text-slate-900 dark:text-slate-100">
              {formatters.bytes(size ?? 0)}
            </p>
          </div>
        );
      case "Storage":
        return (
          <div className="w-full flex" style={{ justifyContent: "space-between", alignItems: "center" }}>

            <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", width: "70%" }}>
              <IMGSvg fontSize={23} />
              <p className="text-sm text-sky-500 dark:text-slate-100">
                {formatters.truncateMiddle(path, 50)}
              </p>
              <p className="text-sm text-black dark:text-slate-100">
                {formatters.truncateMiddle(filename, 30)}
              </p>
            </div>

            <p className="text-sm text-slate-900 dark:text-slate-100">
              {formatters.bytes(size ?? 0)}
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (

    <div className="space-y-4 py-3">
      <h3 className="text-base font-semibold text-black dark:text-white">
        {$at("Mounted from KVM storage")}
      </h3>
      <div ref={ref} className="grid h-full grid-rows-(--grid-headerBody)">
        <div className="h-full space-y-4">
          {source === "WebRTC" && (
            <Card>
              <div className="flex items-center gap-x-1.5 px-2.5 py-2 text-sm">
                <ExclamationTriangleIcon className="h-4 text-yellow-500" />
                <div className="flex w-full items-center text-black">
                  <div>Closing this tab will unmount the image</div>
                </div>
              </div>
            </Card>
          )}

          <div
            className="animate-fadeIn opacity-0 space-y-4"
            style={{ animationDuration: "0.7s", animationDelay: "0.1s" }}
          >
            <div className="block select-none">
              <div className="group">
                <Card>
                  <div className="w-full px-4 py-4">
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      {renderMediaContent()}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
            <div className="flex select-none items-center justify-between text-xs">
              <div className="select-none text-white dark:text-slate-300">
                <span>{$at("Mounted as")}</span>{" "}
                <span className="font-semibold">
                    {mode === "Disk" ? "Disk" : "CD-ROM"}
                  </span>
              </div>


            </div>
            <div className="flex items-center w-full">

              <Button
                type="primary"
                className={isMobile?"w-full":""}
                onClick={onUnmount}>

                {$at("Unmount")}
              </Button>
              <div></div>
            </div>
          </div>
        </div>
      </div>
    </div>

  );
});
MediaMountedDetails.displayName = "MediaMountedDetails";

// 主组件

interface UnMountPageProps {
  unmountedPage: React.ReactNode;
}

export default function UnMountPage({ unmountedPage }: UnMountPageProps) {
  const diskDataChannelStats = useRTCStore(state => state.diskDataChannelStats);
  const [send] = useJsonRpc();
  const { remoteVirtualMediaState, setRemoteVirtualMediaState } = useMountMediaStore();
  const setUsbEpMode = useUsbEpModeStore(state => state.setUsbEpMode);

  const close = useClose();
  const location = useLocation();

  const getUsbEpMode = useCallback(() => {
    send("getUsbDevices", {}, resp => {
      if ("error" in resp) {
        console.error("Failed to load USB devices:", resp.error);
        notifications.error(
          `Failed to load USB devices: ${resp.error.data || "Unknown error"}`,
        );
      } else {
        const usbConfigState = resp.result as UsbDeviceConfig;
        if (usbConfigState.mtp && !usbConfigState.audio) {
          setUsbEpMode("mtp");
        } else if (usbConfigState.audio && !usbConfigState.mtp) {
          setUsbEpMode("uac");
        } else {
          setUsbEpMode("disabled");
        }
      }
    });
  }, [send, setUsbEpMode]);

  const bytesSentPerSecond = useMemo(() => {
    if (diskDataChannelStats.size < 2) return null;

    const secondLastItem =
      Array.from(diskDataChannelStats)[diskDataChannelStats.size - 2];
    const lastItem = Array.from(diskDataChannelStats)[diskDataChannelStats.size - 1];

    if (!secondLastItem || !lastItem) return 0;

    const lastTime = lastItem[0];
    const secondLastTime = secondLastItem[0];
    const timeDelta = lastTime - secondLastTime;

    const lastBytesSent = lastItem[1].bytesSent;
    const secondLastBytesSent = secondLastItem[1].bytesSent;
    const bytesDelta = lastBytesSent - secondLastBytesSent;

    return bytesDelta / timeDelta;
  }, [diskDataChannelStats]);

  const syncRemoteVirtualMediaState = useCallback(() => {
    send("getVirtualMediaState", {}, response => {
      if ("error" in response) {
        notifications.error(
          `Failed to get virtual media state: ${response.error.message}`,
        );
      } else {
        setRemoteVirtualMediaState(response.result as unknown as RemoteVirtualMediaState);
      }
    });
  }, [send, setRemoteVirtualMediaState]);

  const handleUnmount = () => {
    send("unmountImage", {}, response => {
      if ("error" in response) {
        notifications.error(`Failed to unmount image: ${response.error.message}`);
      } else {
        syncRemoteVirtualMediaState();
      }
    });
  };

  useEffect(() => {
    syncRemoteVirtualMediaState();
    getUsbEpMode();
  }, [syncRemoteVirtualMediaState, location.pathname, getUsbEpMode]);

  // 根据状态渲染不同的页面

  if (!remoteVirtualMediaState) {
    return unmountedPage;
  } else {
    return (
      <MediaMountedDetails
        remoteVirtualMediaState={remoteVirtualMediaState}
        bytesSentPerSecond={bytesSentPerSecond}

        onUnmount={handleUnmount}
      />
    );
  }


}
