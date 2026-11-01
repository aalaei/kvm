import React, { useEffect, useMemo, useState } from "react";
import KeyboardSVG from "@assets/second/keyboard.svg?react";
import Keyboard2SVG from "@assets/second/keyboard2.svg?react";
import MouseSVG from "@assets/second/mouse.svg?react";
import VideoSVG from "@assets/second/vedio.svg?react";
import MediaSVG from "@assets/second/media.svg?react";
import { LuMonitorPlay } from "react-icons/lu";
import HdmlSVG from "@assets/second/hdml.svg?react";
import Hdml2SVG from "@assets/second/hdml2.svg?react";
import UsbSVG from "@assets/second/usb.svg?react";
import Usb2SVG from "@assets/second/usb2.svg?react";
import SwichDirSvg from "@assets/second/swich_dri1.svg?react";
import SwichDirSvg2 from "@assets/second/swich_dir2.svg?react";
import { useReactAt } from "i18n-auto-extractor/react";
import { Button as AntdButton, Typography } from "antd";
import { useInterval } from "usehooks-ts";
import StateSvg from "@assets/second/state.svg?react";

import {
  NetworkSettings,
  useAudioModeStore,
  useHidStore,
  useRTCStore,
  useSettingsStore,
  useUiStore,
  useUsbEpModeStore,
  useVideoStore,
  useVpnStore,
} from "@/hooks/stores";
import { keys, modifiers } from "@/keyboardMappings";
import { keyboards } from "@/keyboardLayouts";
import BottomPopoverButton from "@components/PopoverButton";
import MousePanel from "@components/MousePanel";
import KeyboardPanel from "@/layout/components_bottom/keyboard/KeyboardPanel";
import UsbEpModeSelect from "@/layout/components_bottom/usbepmode/UsbEpModeSelect";
import UsbStatusPanel from "@/layout/components_bottom/usb_status/UsbStatusPanel";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { dark_bg2_style, selected_bt_bg } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import VolumeControl from "@components/VolumeControl";
const { Text } = Typography;

export default function BottomBarPC() {
  const { $at } = useReactAt();
  const {  isDark } = useThemeSettings();
  const activeKeys = useHidStore(state => state.activeKeys);
  const activeModifiers = useHidStore(state => state.activeModifiers);
  const audioMode = useAudioModeStore(state => state.audioMode);
  const usbEpMode = useUsbEpModeStore(state => state.usbEpMode);
  const setDisableFocusTrap = useUiStore(state => state.setDisableVideoFocusTrap);
  const toggleSidebarView = useUiStore(state => state.toggleSidebarView);
  const showPressedKeys = useSettingsStore(state => state.showPressedKeys);
  const forceHttp = useSettingsStore(state => state.forceHttp);
  const sidebarView = useUiStore(state => state.sidebarView);
  const peerConnectionState = useRTCStore(state => state.peerConnectionState);
  const tailScaleConnectionState = useVpnStore(state => state.tailScaleConnectionState);
  const zeroTierConnectionState = useVpnStore(state => state.zeroTierConnectionState);
  const usbState = useHidStore(state => state.usbState);
  const hdmiState = useVideoStore(state => state.hdmiState);


  const keyboardLedState = useHidStore(state => state.keyboardLedState);
  const keyboardLayout = useSettingsStore(state => state.keyboardLayout);
  const isTurnServerInUse = useRTCStore(state => state.isTurnServerInUse);

  const layoutAbbrev = useMemo(() => {
    if (!keyboardLayout) return "en_US";
    return keyboardLayout;
  }, [keyboardLayout]);

  const [hostname, setHostname] = useState("");
  const [send] = useJsonRpc();
  const peerConnection = useRTCStore(state => state.peerConnection);
  const mediaStream = useRTCStore(state => state.mediaStream);
  const [fps, setFps] = useState(0);
  useInterval(function collectWebRTCStats() {
    (async () => {
      if (forceHttp) return;
      if (!mediaStream) return;
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) return;
      const stats = await peerConnection?.getStats();


      stats?.forEach(report => {
        if (report.type === "inbound-rtp") {
          setFps(report.framesPerSecond);
        }
      });
    })();
  }, 500);

  const videoButtonLabel = useMemo(() => {
    if (forceHttp) {
      return "N/A fps";
    }
    return `${Math.round(fps)}fps`;
  }, [forceHttp, fps]);
  useEffect(() => {
    send("getNetworkSettings", {}, resp => {
      if ("error" in resp) return;
      const data = resp.result as NetworkSettings;
      setHostname(data.hostname);
    });
  }, [send]);

  return (
    <div className={`${dark_bg2_style} border-t border-t-slate-800/30 text-slate-800 dark:border-t-slate-300/20 dark:text-white`}>
      <div className="flex flex-wrap items-stretch justify-between gap-1 h-[24px] ">
        <div className="flex items-center">
          <div className="flex flex-wrap items-center pl-2 gap-x-4">
            <Text style={{ fontSize: 12 }}>{hostname}:</Text>

            <ConnectionStatusButton
              icon={hdmiState === "ready" ? <Hdml2SVG fontSize={16} /> : <HdmlSVG fontSize={16} />}
              text={$at("HDMI")}
              isActive={hdmiState === "ready"}
            />

            <BottomPopoverButton
              buttonIconNode={usbState === "configured" ? <Usb2SVG fontSize={16} /> : <UsbSVG fontSize={16} />}
              buttonText={$at("USB")}
              style={{ color: usbState === "configured" ? "rgba(0, 205, 27, 1)" : "inherit" }}
              panelContent={<UsbStatusPanel />}
              align="left"
            />

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

            {showPressedKeys && (
              <PressedKeysDisplay
                activeKeys={activeKeys}
                activeModifiers={activeModifiers}
                $at={$at}
              />
            )}
          </div>
        </div>
        {/**/}
        <div className="flex items-center h-full">

          {isTurnServerInUse && (
            <div className="shrink-0 p-1 px-1.5 text-xs text-black dark:text-white">
              Relayed by Cloudflare
            </div>
          )}
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
          <BottomPopoverButton
            buttonIconNode={
              <div className="flex items-center">
                <span className="pl-1 pr-1">
                  {isDark ? <Keyboard2SVG fontSize={16} /> : <KeyboardSVG fontSize={16} />}
                </span>
                <LedStatusButton
                  ledState={keyboardLedState?.num_lock}
                  text={$at("Num")}
                />
                <LedStatusButton
                  ledState={keyboardLedState?.caps_lock}

                  text={$at("Caps")}
                />
                <LedStatusButton
                  ledState={keyboardLedState?.scroll_lock}
                  text={$at("Scroll")}
                />
                <span className="pl-1 text-xs opacity-70" style={{ fontSize: 12 }}>{layoutAbbrev}</span>
              </div>
            }
            align="left"
            panelContent={<KeyboardPanel />}
          />
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
                 
            <BottomPopoverButton
              buttonText={$at("Mouse")}
              buttonIconNode={<MouseSVG fontSize={16} />}
              align="left"
              panelContent={<MousePanel />}
            />
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />

            <UsbEpModeSelect />


          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
                 
          {(audioMode !== "disabled") && (
            <div className="hidden lg:block px-2 h-full">
              <VolumeControl size="XS" theme="light" />
              <div style={{ width: "1px", height: "100%" }}
                   className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
            </div>
          )}

          {(usbEpMode == "mtp") && (
            <AntdButton
              type={"text"}
              size={"small"}
              icon={isDark ? <SwichDirSvg2 fontSize={16} /> : <SwichDirSvg fontSize={16} />}
              onClick={() => {
                setDisableFocusTrap(true);
                toggleSidebarView("SharedFolders");
              }}
              style={{height:"24px",borderRadius:0, fontSize: "12px", color: "inherit"}}
              className={sidebarView === "SharedFolders" ? selected_bt_bg : ""}
            >{$at("Shared Folders")}
            </AntdButton>

          )}
          
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />

          <AntdButton
            type={"text"}
            size={"small"}
            icon={<LuMonitorPlay fontSize={16} />}
            onClick={() => {
              setDisableFocusTrap(true);
              toggleSidebarView("HdmiSwitch");
            }}
            style={{height:"24px",borderRadius:0, fontSize: "12px", color: "inherit"}}
            className={sidebarView === "HdmiSwitch" ? selected_bt_bg : ""}
          >
            {$at("HDMI Switch")}
          </AntdButton>
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
          <AntdButton
            type={"text"}
            size={"small"}
            icon={<MediaSVG fontSize={16} />}
            onClick={() => {
              setDisableFocusTrap(true);
              toggleSidebarView("VirtualMedia");
            }}
            style={{height:"24px",borderRadius:0, fontSize: "12px", color: "inherit"}}
            className={sidebarView === "VirtualMedia" ? selected_bt_bg : ""}
          >
            {$at("Virtual Media")}
          </AntdButton>
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
          <AntdButton
            icon={<VideoSVG fontSize={16} />}
            type={"text"}
            size={"small"}
            onClick={() => {
              setDisableFocusTrap(true);
              toggleSidebarView("SettingsVideo");
            }}
            style={{height:"24px",borderRadius:0, fontSize: "12px", color: "inherit"}}
            className={sidebarView === "SettingsVideo" ? selected_bt_bg : ""}
          >
            {videoButtonLabel}
          </AntdButton>
          <div style={{ width: "1px", height: "100%" }}
               className={"bg-[rgba(229,229,229,1)] dark:bg-[rgba(56,56,56,1)]"} />
          {!forceHttp && (
          <div className="hidden md:block">

            <AntdButton
              type={"text"}
              size={"small"}
              icon={<StateSvg fontSize={16} />}
              onClick={() => {
                toggleSidebarView("connection-stats");
              }}
              style={{height:"24px",borderRadius:0, fontSize: "12px", color: "inherit"}}
              className={sidebarView === "connection-stats" ? selected_bt_bg : ""}
            >
              {$at("Stats")}
            </AntdButton>
          </div>
          )}

          {keyboardLedState?.compose && (
            <div className="shrink-0 p-1 px-1.5 text-xs">{$at("Compose")}</div>
          )}
          {keyboardLedState?.kana && (
            <div className="shrink-0 p-1 px-1.5 text-xs">{$at("Kana")}</div>
          )}
        </div>
      </div>
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
        color: isActive ? "rgba(0, 205, 27, 1)" : "inherit",
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
          width: "7px",
          height: "7px",
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
        color: "inherit",
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
    <div className="flex items-center justify-center px-2" style={{ color: "inherit" }}>
      <div style={{
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        backgroundColor: ledState ? "rgba(0, 205, 27, 1)" : "rgba(205, 205, 205, 1)",
        marginRight: "6px",
      }}></div>
      <span style={{ fontSize: 12, position: "relative", top: "1px" }}>{text}</span>
    </div>
  );
}

interface PressedKeysDisplayProps {
  activeKeys: any[];
  activeModifiers: any[];
  $at: any;
}

function PressedKeysDisplay({ activeKeys, activeModifiers, $at }: PressedKeysDisplayProps) {
  return (
    <div className="flex items-center gap-x-1" style={{ position: "relative", top: "1px", fontSize: 12}}>
      <span className="font-semibold">{$at("Keys")}:</span>
      <h2>
        {[
          ...activeKeys.map(x => Object.entries(keys).filter(y => y[1] === x)[0][0]),
          activeModifiers.map(x => Object.entries(modifiers).filter(y => y[1] === x)[0][0]),
        ].join(", ")}
      </h2>
    </div>
  );
}
