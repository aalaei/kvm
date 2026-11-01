import { useEffect, useState } from "react";
import { Dropdown, MenuProps , Typography, Button as AntdButton } from "antd";
import DownSvg from "@assets/second/dwon.svg?react";
import MingLingSvg from "@assets/second/MingLing.svg?react";
import { useReactAt } from "i18n-auto-extractor/react";
import { isMobile } from "react-device-detect";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import useKeyboard from "@/hooks/useKeyboard";
import { useMacrosStore, useUiStore } from "@/hooks/stores";
import {
  dark_bd_style,
  dark_bg_style_fun,
  dark_font_style,
  text_primary_color,
} from "@/layout/theme_color";
import { useTheme } from "@/layout/contexts/ThemeContext";
import SmartButton from "@components/SmartButton";

export default function MacroTopBar() {
  const { macros, initialized, loadMacros, setSendFn } = useMacrosStore();
  const { executeMacro } = useKeyboard();
  const [send] = useJsonRpc();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const setDisableFocusTrap = useUiStore(state => state.setDisableVideoFocusTrap);
  const toggleSidebarView = useUiStore(state => state.toggleSidebarView);
  const { $at } = useReactAt();
  const toggleTopBarView = useUiStore(state => state.toggleTopBarView);
  const sidebarView = useUiStore(state => state.sidebarView);
  const { isDark } = useTheme();

  useEffect(() => {
    setSendFn(send);

    if (!initialized) {
      loadMacros();
    }
  }, [initialized, loadMacros, setSendFn, send]);

  const dropdownItems: MenuProps["items"] = macros.slice(4).map(macro => ({
    key: macro.id,
    label: (
      <AntdButton
        key={macro.id}
        color="default" variant="outlined"
        className={"text-[rgba(51,51,51,1)] dark:text-white"}
        style={{ backgroundColor: "transparent", width: "100%" }}
        onClick={() => executeMacro(macro.steps)}
      >{macro.name}</AntdButton>


    ),
  }));
  //${dark_bg_style}
  if (isMobile) {
    return (
      <div
        className={`flex items-center h-full w-[100vw] ${dark_bg_style_fun(isDark)} ${macros.length == 0 ? "justify-end" : "justify-between"}  px-[5px]  `}
      >
        <AntdButton
          type={"text"}
          style={{ height: "80%", lineHeight: "80%" }}
          icon={<div
            className={sidebarView == "Macros" ? text_primary_color: dark_font_style}>
            <MingLingSvg />
          </div>}

          onClick={() => {
            // setDisableFocusTrap(false);
            setDisableFocusTrap(true);
            toggleSidebarView("Macros");
          }}
        />

        {macros.slice(0, 4).map(macro => (

          <SmartButton
            key={macro.id}
            maxWidth={110}
            onClick={() => executeMacro(macro.steps)}
            style={{
              background: "transparent",
              whiteSpace: "nowrap",
              width: "19%",
              height: "80%", lineHeight: "80%"
            }}
            text={macro.name}
          >

          </SmartButton>

        ))}

        {macros.length > 4 && (
          <AntdButton
            icon={<DownSvg fontSize={18} className={dark_font_style} />}
            style={{ height: "80%", lineHeight: "80%" }}
            onClick={(e) => {
              e.stopPropagation();
              toggleTopBarView("MacroMoreList");
            }}></AntdButton>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <div className="flex flex-wrap gap-1 items-center">
        <AntdButton
          type={"text"}
          icon={<MingLingSvg />}
          className={dark_bd_style}
          onClick={() => {
            // setDisableFocusTrap(false);
            setDisableFocusTrap(true);
            toggleSidebarView("Macros");
          }}
        >{$at("Macros")}</AntdButton>
        {/*   aria-label={macro.name}*/}
        {macros.slice(0, 4).map(macro => (
          <SmartButton
            key={macro.id}
            maxWidth={120}
            color="default" variant="outlined"
            className={"text-[rgba(51,51,51,1)] dark:text-white"}
            text={macro.name}
            style={{
              backgroundColor: "transparent",
              height: "95%",
              width: "60px",
              lineHeight: "95%",
              padding: "6px 6px",
            }}
            onClick={() => executeMacro(macro.steps)}
          />
        ))}
        {macros.length > 4 && (
          <Dropdown
            menu={{ items: dropdownItems }}
            placement="bottomRight"
            trigger={["click"]}
            className={dark_bd_style}
            open={dropdownVisible}
          >

            <AntdButton
              onClick={(e) => {
                e.stopPropagation();
                setDropdownVisible(!dropdownVisible);
              }}
              color="default" variant="outlined"
              style={{ backgroundColor: "transparent", height: "95%", lineHeight: "95%", padding: "3px 3px" }}
              icon={<DownSvg fontSize={20} className={dark_font_style} />}
            />
          </Dropdown>
        )}
      </div>
    </div>
  );
}

function MacroMoreList() {
  const { macros } = useMacrosStore();
  const { executeMacro } = useKeyboard();
  return (
    <div className={"flex flex-col-reverse w-full"}>
      {
        macros.slice(4).map(macro => (
          <AntdButton
            key={macro.id}
            onClick={() => executeMacro(macro.steps)}
            color="default" variant="outlined"
            style={{ backgroundColor: "transparent" }}
            className={"my-1 w-full  text-[rgba(51,51,51,1)] dark:text-white dark:bg-black"}
          >
            {macro.name}
          </AntdButton>

        ))
      }
    </div>
  );

}

export { MacroMoreList };