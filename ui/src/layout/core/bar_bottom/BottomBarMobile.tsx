import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button as AntdButton, Typography } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import KeyboardSVG from "@assets/second/keyboard.svg?react";
import Keyboard2SVG from "@assets/second/keyboard2.svg?react";
import MouseSVG from "@assets/second/mouse.svg?react";
import VideoSVG from "@assets/second/vedio.svg?react";
import Video2SVG from "@assets/second/vedio2.svg?react";
import MediaSVG from "@assets/second/media.svg?react";
import USCSvg from "@assets/second/UAC.svg?react";
import StateSvg from "@assets/second/state.svg?react";
import HdmlSVG from "@assets/second/hdml.svg?react";
import Hdml2SVG from "@assets/second/hdml2.svg?react";
import UsbSVG from "@assets/second/usb.svg?react";
import Usb2SVG from "@assets/second/usb2.svg?react";
import { useInterval } from "usehooks-ts";

import {
  AvailableSidebarViews,
  NetworkSettings,
  useHidStore,
  useRTCStore,
  useSettingsStore,
  useUiStore,
  useVpnStore,
} from "@/hooks/stores";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { keyboards } from "@/keyboardLayouts";
import {
  button_primary_color,
  dark_bd_style,
 dark_bg_style_fun,
  dark_font_style,

  text_primary_color,
} from "@/layout/theme_color";
import { useTheme } from "@/layout/contexts/ThemeContext";

const { Text } = Typography;
const views = [
  "KeyboardPanel",
  "MousePanel",
  "UsbEpModeSelect",
  "VirtualMedia",
  "SettingsVideo",
  "connection-stats"
];
export default function BottomBarMobile() {
  const { $at } = useReactAt();
  const keyboardLedState = useHidStore(state => state.keyboardLedState);
  const keyboardLayout = useSettingsStore(state => state.keyboardLayout);
  const { isDark } = useTheme();

  const layoutAbbrev = useMemo(() => {
    if (!keyboardLayout) return "en_US";
    return keyboardLayout;
  }, [keyboardLayout]);
  const setDisableFocusTrap = useUiStore(state => state.setDisableVideoFocusTrap);
  const toggleSidebarView = useUiStore(state => state.toggleSidebarView);
  const forceHttp = useSettingsStore(state => state.forceHttp);

  const peerConnectionState = useRTCStore(state => state.peerConnectionState);
  const tailScaleConnectionState = useVpnStore(state => state.tailScaleConnectionState);
  const zeroTierConnectionState = useVpnStore(state => state.zeroTierConnectionState);
  const usbState = useHidStore(state => state.usbState);

  const [hostname, setHostname] = useState("");
  const [activeTab, setActiveTab] = useState<number>(-1);
  const [send] = useJsonRpc();
  const peerConnection = useRTCStore(state => state.peerConnection);
  const mediaStream = useRTCStore(state => state.mediaStream);
  const [fps, setFps] = useState(0);
  const isVirtualKeyboardEnabled = useHidStore(state => state.isVirtualKeyboardEnabled);
  useInterval(function collectWebRTCStats() {
    (async () => {
      if (forceHttp) return;
      if (!mediaStream) return;
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) return;
      const stats = await peerConnection?.getStats();


      stats?.forEach(report => {
        if (report.type === "inbound-rtp") {
          setFps(report.framesPerSecond ?? 0);
        }
      });
    })();
  }, 500);
  useEffect(() => {
    send("getNetworkSettings", {}, resp => {
      if ("error" in resp) return;
      const data = resp.result as NetworkSettings;
      setHostname(data.hostname);
    });
  }, [send]);


  const handleTabClick = useCallback((index: number) => {

    if (index < views.length) {
      setDisableFocusTrap(true);
      toggleSidebarView(views[index] as AvailableSidebarViews);
    }

    setActiveTab(activeTab === index ? -1 : index);
  }, [activeTab, setDisableFocusTrap, toggleSidebarView]);

  const activeColor = "#2563eb";
  const inactiveColor = "#000";

  const tabs = [
    { icon: isDark ? Keyboard2SVG : KeyboardSVG, label: $at("keyboard") },
    { icon: MouseSVG, label: $at("mouse") },
    { icon: USCSvg, label: $at("UAC") },
    { icon: MediaSVG, label: $at("media") },
    { icon: isDark ? Video2SVG : VideoSVG, label: $at("video") },
    { icon: StateSvg, label: $at("status") },
  ];
  const videoButtonLabel = forceHttp ? "N/A fps" : `${Math.round(fps)}fps`;
  if(isVirtualKeyboardEnabled){
    return <></>
  }
  return (
    <div className={`h-30 w-[100vw] flex flex-col ${dark_bg_style_fun(isDark)}`}>
      <div className={`h-3/7 w-full ${dark_bg_style_fun(isDark)} flex flex-row flex-wrap items-center 
                      justify-between bg-white border-t border-gray-200 ${dark_bd_style}`}>
        {tabs.map((tab, index) => {
          const isStatsTab = index === 5;
          if (forceHttp && isStatsTab) {
            return null;
          }
          return (
            <TabButton
              key={index}
              icon={tab.icon}
              index={index}
              activeTab={activeTab}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              onClick={handleTabClick}
            />
          );
        })}
      </div>

      <div className={`h-2/7 w-full flex flex-row flex-wrap items-center 
                        justify-between bg-white ${dark_bg_style_fun(isDark)} 
                        border-t border-b border-gray-200 ${dark_bd_style}`}>
        <div className="w-[80%] flex flex-row flex-wrap items-center justify-start">
          <LedStatusButton ledState={keyboardLedState?.num_lock} text={$at("Num")} />
          <LedStatusButton ledState={keyboardLedState?.caps_lock} text={$at("Caps")} />
          <LedStatusButton ledState={keyboardLedState?.scroll_lock} text={$at("Scroll")} />
          <span className="pl-2 text-xs opacity-70">{layoutAbbrev}</span>
        </div>
        <div className="w-[20%] flex flex-row flex-wrap items-center justify-end">
          <AntdButton
            type="text"
            size="small"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            {videoButtonLabel}
          </AntdButton>
        </div>
      </div>

      <div className={`h-2/7 w-full flex flex-row flex-wrap items-center justify-evenly bg-white ${dark_bg_style_fun(isDark)}`}>
        <Text style={{ fontSize: 12 }}>{hostname}:</Text>
        <ConnectionStatusButton
          icon={peerConnectionState ? <Hdml2SVG /> : <HdmlSVG />}
          text={$at("HDMI")}
          isActive={!!peerConnectionState}
        />
        <div onClick={() => toggleSidebarView("UsbStatusPanel")}>
          <ConnectionStatusButton
            icon={usbState === "configured" ? <Usb2SVG /> : <UsbSVG />}
            text={$at("USB")}
            isActive={usbState === "configured"}
          />
        </div>
        <VpnStatusButton
          text={$at("TailScale")}
          peerState={peerConnectionState}
          vpnState={tailScaleConnectionState}
        />
        <VpnStatusButton
          text={$at("Zerotier")}
          peerState={peerConnectionState}
          vpnState={zeroTierConnectionState}
        />
      </div>
    </div>
  );
}

interface TabButtonProps {
  icon: React.ComponentType<any>;
  index: number;
  activeTab: number;
  activeColor: string;
  inactiveColor: string;
  onClick: (index: number) => void;
  disabled?: boolean;
}

function TabButton({ icon: Icon, index, onClick, disabled }: TabButtonProps) {
  const sidebarView = useUiStore(state => state.sidebarView);
  const isActive = !disabled && sidebarView === views[index];

  return (
    <div
      className={`
        h-full w-1/6 flex justify-center items-center ${disabled ? "cursor-default" : "cursor-pointer"} relative
        transition-all duration-200 ease-in-out
        ${isActive ? "text-[rgba(22,152,217,1)]" : `text-gray-600 ${dark_font_style}`}
      `}
      onClick={() => {
        if (!disabled) {
          onClick(index);
        }
      }}
    >
      <Icon
        style={{
          width: 18,
          height: 18,
        }}
        className={isActive?text_primary_color:dark_font_style}
      />
      <div
        className={`
          absolute bottom-0 left-0 w-full h-0.5 ${button_primary_color} transition-all duration-200
          ${isActive ? "opacity-100" : "opacity-0"}
        `}
      />
    </div>
  );
}

interface ConnectionStatusButtonProps {
  icon: React.ReactNode;
  text: string;
  isActive: boolean;
}

function ConnectionStatusButton({ icon, text, isActive }: ConnectionStatusButtonProps) {
  return (
    <AntdButton
      icon={icon}
      type="text"
      size="small"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isActive ? "rgba(0, 205, 27, 1)" : "rgba(205, 205, 205, 1)",
        fontSize: 12,
      }}
    >
      {text}
    </AntdButton>
  );
}

interface VpnStatusButtonProps {
  text: string;
  peerState: any;
  vpnState: any;
}

function VpnStatusButton({ text, peerState, vpnState }: VpnStatusButtonProps) {
  const getVpnColor = () => {
    if (peerState === "connected" && vpnState === "connected") {
      return "rgb(22, 152, 217,1)";
    }
    return vpnState === "logined" ? "rgba(0, 205, 27, 1)" : "rgba(205, 205, 205, 1)";
  };

  return (
    <AntdButton
      icon={
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: getVpnColor(),
        }}></div>
      }
      type="text"
      size="small"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
    >
      {text}
    </AntdButton>
  );
}

interface LedStatusButtonProps {
  ledState: boolean | undefined;
  text: string;
}

function LedStatusButton({ ledState, text }: LedStatusButtonProps) {
  return (
    <AntdButton
      icon={
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: ledState ? "rgba(0, 205, 27, 1)" : "rgba(205, 205, 205, 1)",
        }}></div>
      }
      type="text"
      size="small"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
    >
      {text}
    </AntdButton>
  );
}
