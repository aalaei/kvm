import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isMobile } from "react-device-detect";

import { useUiStore, useUsbEpModeStore, useAudioModeStore, useSettingsStore } from "@/hooks/stores";

import { useJsonRpc } from "../../../hooks/useJsonRpc";
import notifications from "../../../notifications";

import { UsbEpModeSelectMobile } from './UsbEpModeSelect.mobile';
import { UsbEpModeSelectPC } from './UsbEpModeSelect.pc';
import { UsbDeviceConfig, defaultUsbDeviceConfig } from './usbModeOptions';

const UsbEpModeSelect: React.FC = () => {
  const setDisableKeyboardFocusTrap = useUiStore(state => state.setDisableVideoFocusTrap);
  const usbEpMode = useUsbEpModeStore(state => state.usbEpMode);
  const setUsbEpMode = useUsbEpModeStore(state => state.setUsbEpMode);
  const audioMode = useAudioModeStore(state => state.audioMode);
  const setAudioMode = useAudioModeStore(state => state.setAudioMode);
  const forceHttp = useSettingsStore(state => state.forceHttp);
  const [send] = useJsonRpc();
  const [loading, setLoading] = useState(false);
  const [usbDeviceConfig, setUsbDeviceConfig] = useState<UsbDeviceConfig>(defaultUsbDeviceConfig);

  const syncUsbDeviceConfig = useCallback(() => {
    send("getUsbDevices", {}, resp => {
      if ("error" in resp) {
        console.error("Failed to load USB devices:", resp.error);
        notifications.error(
          `Failed to load USB devices: ${resp.error.data || "Unknown error"}`,
        );
      } else {
        const usbConfigState = resp.result as UsbDeviceConfig;
        setUsbDeviceConfig(usbConfigState);
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

  const handleUsbConfigChange = useCallback(
    (devices: UsbDeviceConfig) => {
      setLoading(true);
      send("setUsbDevices", { devices }, async resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to set usb devices: ${resp.error.data || "Unknown error"}`,
          );
          setLoading(false);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        setLoading(false);
        syncUsbDeviceConfig();
        notifications.success(`USB Devices updated`);
      });
    },
    [send, syncUsbDeviceConfig],
  );

  const handleAudioModeChange = (mode: string) => {
    send("setAudioMode", { mode }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to set Audio Mode: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }

      notifications.success(`Audio Mode set to ${mode}. It takes effect after refreshing the page`);
      setAudioMode(mode);
      window.location.reload();
    });
  };

  const handleUsbEpModeChange = useCallback(
    (newMode: string) => {
      setUsbEpMode(newMode);
    },
    [setUsbEpMode],
  );
  useEffect(() => {
    syncUsbDeviceConfig();

    send("getAudioMode", {}, resp => {
      if ("error" in resp) return;
      setAudioMode(String(resp.result));
    });
  }, [syncUsbDeviceConfig, send, setAudioMode]);

  const Component = isMobile ? UsbEpModeSelectMobile : UsbEpModeSelectPC;

  const effectiveUsbEpMode = useMemo(() => {
    if (forceHttp && usbEpMode === "uac") {
      return "disabled";
    }
    return usbEpMode;
  }, [forceHttp, usbEpMode]);

  useEffect(() => {
    if (!forceHttp) return;
    if (usbEpMode !== "uac") return;

    const nextConfig: UsbDeviceConfig = {
      ...usbDeviceConfig,
      audio: false,
      mtp: false,
    };

    handleUsbConfigChange(nextConfig);
    setUsbEpMode("disabled");
    if (audioMode !== "disabled") {
      handleAudioModeChange("disabled");
    }
  }, [forceHttp, usbEpMode, usbDeviceConfig, handleUsbConfigChange, setUsbEpMode, audioMode]);

  const filteredUsbDeviceConfig = useMemo<UsbDeviceConfig>(() => {
    if (!forceHttp) return usbDeviceConfig;
    return {
      ...usbDeviceConfig,
      audio: false,
    };
  }, [forceHttp, usbDeviceConfig]);

  return (
    <Component
      usbEpMode={effectiveUsbEpMode}
      loading={loading}
      usbDeviceConfig={filteredUsbDeviceConfig}
      audioMode={audioMode}
      onUsbEpModeChange={handleUsbEpModeChange}
      onUsbConfigChange={handleUsbConfigChange}
      onAudioModeChange={handleAudioModeChange}
    />
  );
};

export default UsbEpModeSelect;
