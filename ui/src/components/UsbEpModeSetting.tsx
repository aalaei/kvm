import { useCallback , useEffect, useState } from "react";
import {useReactAt} from 'i18n-auto-extractor/react'

import { SettingsItem } from "@components/Settings/SettingsView";

import { useJsonRpc } from "../hooks/useJsonRpc";
import notifications from "../notifications";
import { useUsbEpModeStore, useAudioModeStore } from "../hooks/stores";

import { SelectMenuBasic } from "./SelectMenuBasic";
import Fieldset from "./Fieldset";

export interface UsbDeviceConfig {
  keyboard: boolean;
  absolute_mouse: boolean;
  relative_mouse: boolean;
  mass_storage: boolean;
  mtp: boolean;
  audio: boolean;
}

const defaultUsbDeviceConfig: UsbDeviceConfig = {
  keyboard: true,
  absolute_mouse: true,
  relative_mouse: true,
  mass_storage: true,
  mtp: false,
  audio: true,
};

export function UsbEpModeSetting() {
  const { $at }= useReactAt();
  const usbEpMode = useUsbEpModeStore(state => state.usbEpMode)
  const setUsbEpMode = useUsbEpModeStore(state => state.setUsbEpMode)
 
  const audioMode = useAudioModeStore(state => state.audioMode);
  const setAudioMode = useAudioModeStore(state => state.setAudioMode);

  
  const [send] = useJsonRpc();
  const [loading, setLoading] = useState(false);

  const [usbDeviceConfig, setUsbDeviceConfig] =
    useState<UsbDeviceConfig>(defaultUsbDeviceConfig);

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
  }, [send]);

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

        // We need some time to ensure the USB devices are updated
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

      notifications.success(`Audio Mode set to ${mode}.It takes effect after refreshing the page`);
      setAudioMode(mode);
      window.location.reload();
    });
  };

  
  const handleUsbEpModeChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMode = e.target.value;
      setUsbEpMode(newMode);
      
      if (newMode === "uac") {
        handleUsbConfigChange({
          ...usbDeviceConfig,
          audio: true,
          mtp: false,
        })
        setUsbEpMode("uac");
      } else if (newMode === "mtp") {
        handleUsbConfigChange({
          ...usbDeviceConfig,
          audio: false,
          mtp: true,
        })
        if (audioMode !== "disabled") {
          handleAudioModeChange("disabled");
        }
        setUsbEpMode("mtp");
      } else {
        handleUsbConfigChange({
          ...usbDeviceConfig,
          audio: false,
          mtp: false,
        })
        if (audioMode !== "disabled") {
          handleAudioModeChange("disabled");
        }
        setUsbEpMode("disabled");
      }
    },
    [handleUsbConfigChange, usbDeviceConfig, audioMode],
  );

  useEffect(() => {
    syncUsbDeviceConfig();
    
    send("getAudioMode", {}, resp => {
      if ("error" in resp) return;
      setAudioMode(String(resp.result));
    });

  }, [syncUsbDeviceConfig]);

  return ( 
    <Fieldset disabled={loading} className="space-y-4">
      <div className="h-px w-full bg-slate-800/10 dark:bg-slate-300/20" />
        <SettingsItem
          loading={loading}
          title={$at("USB Expansion Function")}
          description={$at("Select the active USB function (MTP or UAC)")}
        >
          <SelectMenuBasic
            size="SM"
            label=""
            value={usbEpMode}
            fullWidth
            onChange={handleUsbEpModeChange}
            options={[
              { value: "uac", label: $at("UAC(USB Audio Card)")},
              { value: "mtp", label: $at("MTP(Media Transfer Protocol)")},
              { value: "disabled", label: $at("Disabled")},
            ]}
          />
        </SettingsItem>
        
        {usbEpMode === "uac" && (
          <SettingsItem
            loading={loading}
            title="Audio Mode"
            badge="Experimental"
            description="Set the working mode of the audio"
          >
            <SelectMenuBasic
              size="SM"
              label=""
              value={audioMode}
              options={[
                { value: "disabled", label: $at("Disabled")},
                { value: "usb", label: $at("USB")},
                //{ value: "hdmi", label: "HDMI"},
              ]}
              onChange={e => handleAudioModeChange(e.target.value)}
            />
          </SettingsItem>
        )}
    </Fieldset>
  );
}
