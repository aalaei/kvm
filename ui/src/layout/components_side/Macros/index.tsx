import React, { useState, useCallback } from "react";
import { Layout } from "antd";
import { isMobile } from "react-device-detect";

import SettingsMacrosList from "@/layout/components_side/Macros/SettingsMacrosList";
import SettingsMacrosAdd from "@/layout/components_side/Macros/SettingsMacrosAdd";
import SettingsMacrosEdit from "@/layout/components_side/Macros/SettingsMacrosEdit";
import { useMacrosSideTitleState } from "@/hooks/stores";
import { dark_bg2_style } from "@/layout/theme_color";

const SettingsMacros: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<string>("index");
  const setMacrosSideTitle = useMacrosSideTitleState(state => state.setSideTitle);
  const [macroId, setMacroId] = useState<string>("");
  const handleMenuSelect = useCallback((key: string) => {
    console.log("handleMenuSelect:",key)
    setSelectedMenu(key);
  }, []);
  const renderContent = useCallback(() => {
    switch (selectedMenu) {
      case "index":
        setMacrosSideTitle("Keyboard Macros")
        return <SettingsMacrosList onMenuSelect={handleMenuSelect} setMacroId={setMacroId} />;
      case "add":
        setMacrosSideTitle("Add New Macro")
        return <SettingsMacrosAdd onMenuSelect={handleMenuSelect} />;
      case "edit":
        setMacrosSideTitle("Edit Macro")
        return <SettingsMacrosEdit onMenuSelect={handleMenuSelect} macroId={macroId} />;
      default:
        setMacrosSideTitle("Keyboard Macros")
        return <SettingsMacrosList onMenuSelect={handleMenuSelect} setMacroId={setMacroId} />;
    }
  }, [selectedMenu, handleMenuSelect]);

  return (
    <Layout style={{ flex: 1 ,overflow: isMobile?"auto":"hidden"}} className={`${isMobile?"px-[5px]":"p-[5px] "} ${dark_bg2_style}`}>
        {renderContent()}
      {isMobile&&<div className={"h-[90px]"}></div>}
    </Layout>
);
};

export default SettingsMacros;