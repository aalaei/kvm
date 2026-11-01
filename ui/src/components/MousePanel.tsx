import React, { useEffect, useState } from "react";
import { Divider } from "antd";
import { isMobile } from "react-device-detect";
import { useReactAt } from "i18n-auto-extractor/react";

import ScrollThrottlingSelect, { Option } from "@components/ScrollThrottlingSelect";
import { useSettingsStore } from "@/hooks/stores";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { dark_bd_style, dark_bg2_style, dark_line_style, dark_bg_style_fun } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";


const scrollThrottlingOptions = [
  { value: "0", label: "Off" },
  { value: "10", label: "Low" },
  { value: "25", label: "Medium" },
  { value: "50", label: "High" },
  { value: "100", label: "Very High" },
];

const inputModeOptions: Option[] = [
  { label: "Absolute", value: "absolute" },
  { label: "Relative", value: "relative" },
];

const othersOptions: Option[] = [
  { label: "Hide Cursor", value: "hide-cursor" },
  { label: "Jiggler", value: "jiggler" },
];

const MousePanel: React.FC = () => { 
  const { $at } = useReactAt();
  const hideCursor: boolean = useSettingsStore(state => state.isCursorHidden);
  const setHideCursor = useSettingsStore(state => state.setCursorVisibility);
  const { isEnabled: isScrollSensitivityEnabled } = useFeatureFlag("0.3.8");
  const [send] = useJsonRpc();
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    send("getJigglerState", {}, (resp) => {
      if (!("error" in resp) && resp.result) {
        setOthers((prevItems: string[]) => [...prevItems, "jiggler"]);
      } else {
        setOthers((prevItems) => prevItems.filter(item => item !== "jiggler"));
      }
    });
  }, [isScrollSensitivityEnabled, send]);

  useEffect(() => {
    if (hideCursor) {
      setOthers((prevItems: string[]) => [...prevItems, "hide-cursor"]);
    } else {
      setOthers((prevItems) => prevItems.filter(item => item !== "hide-cursor"));
    }
  }, [hideCursor]);

  const handleOtherChange = (data: string[] | string) => {
    console.log(data);
    console.log(data.includes("jiggler"));
    console.log(others.includes("jiggler"));
    if (data.includes("hide-cursor") != others.includes("hide-cursor")) {
      handlehideCursorChange(data.includes("hide-cursor"));
    }
    if (data.includes("jiggler") != others.includes("jiggler")) {
      handleJigglerChange(data.includes("jiggler"));
    }
  };

  const handlehideCursorChange = (enabled: boolean) => {
    console.log("handlehideCursorChange", enabled);
    setHideCursor(enabled);
  };

  const handleJigglerChange = (enabled: boolean) => {
    console.log("handleJigglerChange", enabled);
    send("setJigglerState", { enabled }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to set jiggler state: ${resp.error.data || "Unknown error"}`,
        );
      } else {
        if (enabled) {
          console.log("handleJigglerChange if", enabled);
          setOthers((prevItems: string[]) => [...prevItems, "jiggler"]);
        } else {
          console.log("handleJigglerChange el", enabled);
          setOthers((prevItems) => prevItems.filter(item => item !== "jiggler"));
        }
      }
    });
  };
  const mouseMode = useSettingsStore(state => state.mouseMode);
  const setMouseMode = useSettingsStore(state => state.setMouseMode);
  const [modeData, setModeData] = useState<string>(mouseMode);

  useEffect(() => {
    setModeData(mouseMode);
  }, [mouseMode]);

  const handleModeChange = (data: string[] | string) => {
    setMouseMode(data as string);
  };
  const scrollThrottling = useSettingsStore(state => state.scrollThrottling);
  const setScrollThrottling = useSettingsStore(state => state.setScrollThrottling);
  const [scrollData, setScrollData] = useState<string>(String(scrollThrottling));

  useEffect(() => {
    setScrollData(String(scrollThrottling));
  }, [scrollThrottling]);

  const handleScrollChange = (data: string[] | string) => {
    setScrollThrottling(Number(data as string));
  };
  const DividerLine = ({isMobile = false}: {isMobile?: boolean}) => {
    if (isMobile) {
      return (
        <div className="px-[20px] w-full">
            <Divider size={"small"} className="my-0" />
        </div>
      );
    }
    return <div className={`w-full h-px my-2 ${dark_line_style}`} />
  };

  const { isDark } = useThemeSettings();
  
  if (isMobile) {
    return (
      <div className={`w-full h-full flex flex-col ${dark_bg_style_fun(isDark)}`}>
        <div className={`
          flex flex-col w-full mx-auto
          ${isDark ? 'text-white' : 'text-black'}
        `}>
          <div className="px-[20px] pt-4">
            <ScrollThrottlingSelect
              mode="single"
              title={$at("Scroll Throttling")}
              options={scrollThrottlingOptions}
              value={scrollData}
              onChange={handleScrollChange}
            />
          </div>

          <DividerLine isMobile={true} />

          {/* Input Modes */}
          <div className="px-[20px]">
            <ScrollThrottlingSelect
              mode="single"
              title={$at("Input Modes")}
              options={inputModeOptions}
              value={modeData}
              onChange={handleModeChange}
            />
          </div>

          <DividerLine isMobile={true} />

          {/* Others */}
          <div className="px-[20px]">
            <ScrollThrottlingSelect
              mode="multiple"
              title={$at("Others")}
              options={othersOptions}
              value={others}
              onChange={handleOtherChange}
            />
          </div>
        </div>

      </div>
    );
  }

  <div className="flex flex-col justify-between w-full h-full"></div>
  return (
    <div style={{boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'}} className={` ${isMobile ? 'px-[20px] pt-5 h-full w-full' : 'p-4 w-[240px] rounded'}  font-sans ${dark_bg2_style} border ${dark_bd_style}`}>
      <div className={`w-full h-full   flex flex-col justify-between`}>
        <ScrollThrottlingSelect
          mode="single"
          title={$at("Scroll Throttling")}
          options={scrollThrottlingOptions}
          value={scrollData}
          onChange={handleScrollChange}
        />
        
        <DividerLine />
        <ScrollThrottlingSelect
          mode="single"
          title={$at("Input Modes")}
          options={inputModeOptions}
          value={modeData}
          onChange={handleModeChange}
        />

        <DividerLine />
        <ScrollThrottlingSelect
          mode="multiple"
          title={$at("Others")}
          options={othersOptions}
          value={others}
          onChange={handleOtherChange}
        />
      </div>
    </div>
  );
};

export default MousePanel;
