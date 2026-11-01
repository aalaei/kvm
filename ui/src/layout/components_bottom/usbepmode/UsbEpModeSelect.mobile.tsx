import React from "react";
import { Divider } from "antd";

import { useSettingsStore } from "@/hooks/stores";
import SharedFolders from "@/layout/components_side/SharedFolders";
import { dark_bd_style, dark_bg_style_fun } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import VolumeControl from "@components/VolumeControl";

import { USB_MODE_OPTIONS, UsbDeviceConfig } from "./usbModeOptions";

interface UsbEpModeSelectMobileProps {
  usbEpMode: string;
  loading: boolean;
  usbDeviceConfig: UsbDeviceConfig;
  audioMode: string;
  onUsbEpModeChange: (newMode: string) => void;
  onUsbConfigChange: (devices: UsbDeviceConfig) => void;
  onAudioModeChange: (mode: string) => void;
}

export const UsbEpModeSelectMobile: React.FC<UsbEpModeSelectMobileProps> = ({
                                                                  usbEpMode,
                                                                  loading,
                                                                  usbDeviceConfig,
                                                                  audioMode,
                                                                  onUsbEpModeChange,
                                                                  onUsbConfigChange,
                                                                  onAudioModeChange,
                                                                }) => {
  const forceHttp = useSettingsStore(state => state.forceHttp);
  const handleUsbEpModeChange = async (newMode: string) => {
    onUsbEpModeChange(newMode);

    if (newMode === "uac") {
      onUsbConfigChange({
        ...usbDeviceConfig,
        audio: true,
        mtp: false,
      });
      onAudioModeChange("usb");
    } else if (newMode === "mtp") {
      onUsbConfigChange({
        ...usbDeviceConfig,
        audio: false,
        mtp: true,
      });
      if (audioMode !== "disabled") {
        onAudioModeChange("disabled");
      }
    } else {
      onUsbConfigChange({
        ...usbDeviceConfig,
        audio: false,
        mtp: false,
      });
      if (audioMode !== "disabled") {
        onAudioModeChange("disabled");
      }
    }
  };

  const { isDark } = useThemeSettings();

  return (
    <div className={`w-full h-full flex flex-col  ${dark_bg_style_fun(isDark)}`}>
      <div className={`
        flex flex-col w-full mx-auto
        ${isDark ? 'text-white' : 'bg-white text-black'}
      `}>
        {USB_MODE_OPTIONS.filter(option => !forceHttp || option.value !== "uac").map(option => (
          <div
            key={option.value}
            className={`
              flex items-center justify-between py-4 w-full
              border-b ${dark_bd_style} last:border-b-0
              transition-all duration-200 ease-in-out
              ${isDark ? 'text-white' : 'text-black'}
              ${loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'}
            `}
            onClick={() => !loading && handleUsbEpModeChange(option.value)}
          >
            <span className="font-normal tracking-[0.5px]">
              {option.label}
            </span>
            <span className={`
              text-lg transition-opacity duration-200 ease-in-out
              ${isDark ? 'text-white' : 'text-black'}
              ${usbEpMode === option.value ? 'opacity-100' : 'opacity-0'}
            `}>
              ✓
            </span>
          </div>
        ))}
      </div>

      <Divider size={"small"}/>

      {usbEpMode === "uac" && (
        <div className="w-full px-2">
          <VolumeControl
            size="XL"
            theme="light"
            fullWidth={true}
            className="w-full"
          />
        </div>
      )}

      {usbEpMode === "mtp" && <SharedFolders />}
    </div>
  );
};

export default UsbEpModeSelectMobile;
