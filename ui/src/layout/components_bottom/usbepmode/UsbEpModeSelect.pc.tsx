import React, { CSSProperties } from 'react';
import USCSvg from "@assets/second/UAC.svg?react";
import { CheckOutlined } from '@ant-design/icons';

import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import BottomPopoverButton from "@components/PopoverButton";
import { useSettingsStore } from "@/hooks/stores";
import { dark_bd_style, dark_bg2_style } from "@/layout/theme_color";
import { USB_MODE_OPTIONS, UsbDeviceConfig } from './usbModeOptions';

interface UsbEpModeSelectPCProps {
  usbEpMode: string;
  loading: boolean;
  usbDeviceConfig: UsbDeviceConfig;
  audioMode: string;
  onUsbEpModeChange: (newMode: string) => void;
  onUsbConfigChange: (devices: UsbDeviceConfig) => void;
  onAudioModeChange: (mode: string) => void;
}

export const UsbEpModeSelectPC: React.FC<UsbEpModeSelectPCProps> = ({
                                                          usbEpMode,

                                                          usbDeviceConfig,
                                                          audioMode,
                                                          onUsbEpModeChange,
                                                          onUsbConfigChange,
                                                          onAudioModeChange
                                                        }) => {
  const { isDark } = useThemeSettings();
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

  const currentOption = USB_MODE_OPTIONS.find(opt => opt.value === usbEpMode);
  const buttonText = usbEpMode === "disabled" ? "" : (currentOption?.displayLabel || currentOption?.label || usbEpMode);
  const optionsContainerStyle: CSSProperties = {
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: 220
  };

  const panelContent = (
    <div style={optionsContainerStyle} className={` ${dark_bg2_style} border ${dark_bd_style}`}>
      {USB_MODE_OPTIONS.filter(option => !forceHttp || option.value !== "uac").map(option => {
        const isSelected = option.value === usbEpMode;
        const optionItemStyle: CSSProperties = {
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor:  'transparent',
          color: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        };

        const hoverStyle: CSSProperties = {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'
        };

        return (
          <div
            key={option.value}
            style={optionItemStyle}
            onClick={() => handleUsbEpModeChange(option.value)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hoverStyle.backgroundColor!;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = optionItemStyle.backgroundColor!;
            }}
          >
            <span style={{fontSize:"12px"}}>{option.label}</span>
            {isSelected && (
              <CheckOutlined
                style={{
                  fontSize: '12px',
                  color:  isDark?'#fff':'#999',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <BottomPopoverButton
      buttonText={buttonText}
      buttonIconNode={<USCSvg fontSize={16} />}
      panelContent={panelContent}
      align="left"
    />
  );
};

export default UsbEpModeSelectPC;
