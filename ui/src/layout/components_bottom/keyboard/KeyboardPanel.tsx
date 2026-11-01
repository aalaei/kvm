import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Divider, Button } from "antd";
import LeftSVG from "@assets/second/left.svg?react";
import { isDesktop, isMobile } from "react-device-detect";
import { CloseOutlined } from '@ant-design/icons';
import { useReactAt } from "i18n-auto-extractor/react";

import ScrollThrottlingSelect, { Option } from "@components/ScrollThrottlingSelect";
import { layouts, keyboards } from "@/keyboardLayouts";
import { KeyboardLedSync, useSettingsStore } from "@/hooks/stores";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import KeyboardLayoutModal, { KeyboardLayoutContent } from "@/layout/components_bottom/keyboard/KeyboardLayoutModal";
import { dark_bg2_style, dark_font_style, dark_bd_style, dark_line_style } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";


const KeyboardPanel: React.FC = () => { 
  const { $at } = useReactAt();
  const { isDark } = useThemeSettings();
  const [showMore, setShowMore] = useState(false);
  const keyboardLayout = useSettingsStore(state => state.keyboardLayout);
  const setKeyboardLayout = useSettingsStore(state => state.setKeyboardLayout);

  const [layoutOptions, setLayoutOptions] = useState<Option[]>();
  const [maxShowCount, setMaxShowCount] = useState(3);

  const layoutAbbrevMap = useMemo(() => {
    const map: Record<string, string> = {};
    keyboards.forEach(kb => {
      const oldCode = kb.isoCode.replace("-", "_");
      map[oldCode] = oldCode;
    });
    return map;
  }, []);

  useEffect(() => {
    const curLayoutOptions = (() => {
      const options = Object.entries(layouts).map(([code, language]) => ({
        value: code,
        label: `${language} (${layoutAbbrevMap[code] || code})`,
      }));

      const currentLayout = keyboardLayout ?? "";
      if (!currentLayout) {
        return options;
      }

      const currentIndex = options.findIndex(option => option.value === currentLayout);
      if (currentIndex === -1 || currentIndex < 3) {
        setMaxShowCount(3);
        return options;
      }
      setMaxShowCount(4);
      const [movedItem] = options.splice(currentIndex, 1);
      options.splice(3, 0, movedItem);
      return options;
    })();
    setLayoutOptions(curLayoutOptions);
  }, [layouts, keyboardLayout, layoutAbbrevMap]);

  const safeKeyboardLayout = useMemo(() => {
    if (keyboardLayout && keyboardLayout.length > 0)
      return keyboardLayout;
    return "en_US";
  }, [keyboardLayout]);

  const [send] = useJsonRpc();

  useEffect(() => {
    send("getKeyboardLayout", {}, resp => {
      if ("error" in resp) return;
      setKeyboardLayout(resp.result as string);
    });
  }, []);

  const onKeyboardLayoutChange = useCallback(
    (layout: string[] | string) => {
      send("setKeyboardLayout", { layout }, resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to set keyboard layout: ${resp.error.data || "Unknown error"}`,
          );
        }
        notifications.success("Keyboard layout set successfully");
        setKeyboardLayout(layout as string);
      });
    },
    [send, setKeyboardLayout],
  );

  const keysOptionsList: Option[] = [
    { label: "Show Pressed Keys", value: "show-pressed-keys" },
  ];

  const showPressedKeys = useSettingsStore(state => state.showPressedKeys);
  const setShowPressedKeys = useSettingsStore(state => state.setShowPressedKeys);
  const [keysOptions, setKeysOptions] = useState<string[]>(["show-pressed-keys"]);

  useEffect(() => {
    if (showPressedKeys) {
      setKeysOptions((prevItems: string[]) => [...prevItems, "show-pressed-keys"]);
    } else {
      setKeysOptions((prevItems) => prevItems.filter(item => item !== "show-pressed-keys"));
    }
  }, [showPressedKeys]);

  const handleShowPressedChange = (data: string[] | string) => {
    if (data.includes("show-pressed-keys")) {
      setShowPressedKeys(true);
    } else {
      setShowPressedKeys(false);
    }
  };

  const ledSyncOptions: Option[] = [
    { value: "auto", label: "Auto" },
    { value: "browser", label: "Browser Only" },
    { value: "host", label: "Host Only" },
  ];

  const keyboardLedSync = useSettingsStore(state => state.keyboardLedSync);
  const setKeyboardLedSync = useSettingsStore(state => state.setKeyboardLedSync);
  const [ledSync, setLedSync] = useState<string>(keyboardLedSync);

  useEffect(() => {
    setLedSync(keyboardLedSync);
  }, [keyboardLedSync]);

  const handleLedChange = (data: string[] | string) => {
    setKeyboardLedSync(data as KeyboardLedSync);
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

  //custom-keyboard-layout
  if (showMore && isMobile) {
    return (
      <div className={`${dark_bg2_style} px-[20px] w-full h-full`}>
        <div className={`flex justify-between items-center text-lg font-bold py-4 ${dark_font_style}`}>
          Keyboard Layout
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setShowMore(false)}
            className="text-gray-400"
          />
        </div>
        <KeyboardLayoutContent 
            value={safeKeyboardLayout}
            onChange={onKeyboardLayoutChange}
            layoutOptions={layoutOptions}
        />
      </div>
    );
  }

  if (isMobile && !showMore) {
    return (
      <div className={`w-full h-full flex flex-col ${dark_bg2_style}`}>
        <div className={`
          flex flex-col w-full mx-auto
          ${isDark ? 'text-white' : 'text-black'}
        `}>
          {/* LED State Synchronization */}
          <div className="px-[20px] pt-4">
            <ScrollThrottlingSelect
              mode="single"
              title={$at("LED State Synchronization")}
              options={ledSyncOptions}
              value={ledSync}
              onChange={handleLedChange}
            />
          </div>

          <DividerLine isMobile={true} />

          {/* Keyboard Layout */}
          <div className="px-[20px]">
            <ScrollThrottlingSelect
              mode="single"
              title={$at("Keyboard Layout")}
              options={layoutOptions}
              value={safeKeyboardLayout}
              onChange={onKeyboardLayoutChange}
              maxShowCount={maxShowCount}
              specialOptionText="More"
              specialOptionIcon={<LeftSVG />}
              onSpecialOptionClick={() => setShowMore(true)}
            />
          </div>

          <DividerLine isMobile={true} />

          {/* Keys */}
          <div className="px-[20px]">
            <ScrollThrottlingSelect
              mode="multiple"
              title={$at("Keys")}
              options={keysOptionsList}
              value={keysOptions}
              onChange={handleShowPressedChange}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'}} className={` ${isMobile ? 'px-[20px] pt-5 h-full w-full' : 'p-4 w-[240px] rounded'}  font-sans ${dark_bg2_style} border ${dark_bd_style}`}>
      <div className={`w-full h-full   flex flex-col justify-between`}>
        <ScrollThrottlingSelect
          mode="single"
          title={$at("LED State Synchronization")}
          options={ledSyncOptions}
          value={ledSync}
          onChange={handleLedChange}
        />

        <DividerLine />
        <ScrollThrottlingSelect
          mode="single"
          title={$at("Keyboard Layout")}
          options={layoutOptions}
          value={safeKeyboardLayout}
          onChange={onKeyboardLayoutChange}
          maxShowCount={maxShowCount}
          specialOptionText="More"
          specialOptionIcon={<LeftSVG />}
          onSpecialOptionClick={() => setShowMore(true)}
        />

        <DividerLine />
        <ScrollThrottlingSelect
          mode="multiple"
          title={$at("Keys")}
          options={keysOptionsList}
          value={keysOptions}
          onChange={handleShowPressedChange}
        />
      </div>

      <KeyboardLayoutModal
        visible={showMore && isDesktop}
        onCancel={() => setShowMore(false)}
        value={safeKeyboardLayout}
        onChange={onKeyboardLayoutChange}
        layoutOptions={layoutOptions}
      />
    </div>
  );
};

export default KeyboardPanel;
