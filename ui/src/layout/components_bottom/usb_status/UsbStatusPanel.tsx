import React, { useCallback } from "react";
import { useReactAt } from "i18n-auto-extractor/react";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { dark_bg2_style, dark_bd_style, dark_line_style, dark_bg_style_fun } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import { isMobile } from "react-device-detect";

const UsbStatusPanel: React.FC = () => {
  const { $at } = useReactAt();
  const { isDark } = useThemeSettings();
  const [send] = useJsonRpc();

  const handleReinitializeUsbGadget = useCallback(() => {
    send("reinitializeUsbGadget", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to reinitialize USB gadget: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("USB Gadget reinitialized successfully");
    });
  }, [send]);

  if (isMobile) {
    return (
      <div className={`w-full h-full flex flex-col ${dark_bg_style_fun(isDark)} p-4`}>
        <div className={`flex flex-col w-full mx-auto ${isDark ? 'text-white' : 'text-black'}`}>
          <div
            className={`
              flex items-center justify-between py-4 w-full
              cursor-pointer transition-all duration-200 ease-in-out
              ${isDark ? 'text-white' : 'text-black'}
            `}
            onClick={handleReinitializeUsbGadget}
          >
            <span className="font-normal tracking-[0.5px]">
              {$at("Reinitialize USB Gadget")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }} 
      className={`p-1.5 w-[200px] rounded font-sans ${dark_bg2_style} border ${dark_bd_style}`}
    >
      <div className="flex flex-col">
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '4px',
          }}
          onClick={handleReinitializeUsbGadget}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span style={{ fontSize: "12px" }}>{$at("Reinitialize USB Gadget")}</span>
        </div>
      </div>
    </div>
  );
};

export default UsbStatusPanel;
