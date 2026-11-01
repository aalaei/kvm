import React, { useState } from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";

import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import { button_primary_color, dark_font_style } from "@/layout/theme_color";

interface SideTabsProps {
  tab1Label: string;
  tab2Label: string;
  tab1Content: React.ReactNode;
  tab2Content: React.ReactNode;
  defaultActiveKey?: string;
}

const SideTabs: React.FC<SideTabsProps> = ({
                                             tab1Label,
                                             tab2Label,
                                             tab1Content,
                                             tab2Content,
                                             defaultActiveKey = "1",
                                           }) => {
  const [activeTab, setActiveTab] = useState<string>(defaultActiveKey);
  const { isDark } = useThemeSettings();
  const renderCustomTabBar: TabsProps["renderTabBar"] = () => {
    return (
      <div style={{
        height: "36px",
        width: "100%",
        display: "flex",

        justifyContent: "space-between",

        marginBottom: "10px",
        marginTop: "10px",
      }}
      className={"px-[2px]"}
      >
        <div
          className={`
            flex items-center justify-center 
            w-[48%] -mr-0.5
            py-1 px-4 
            border rounded 
            cursor-pointer 
            font-medium text-xs gap-1 
            ${activeTab === "1"
                    ? `${button_primary_color} !text-white`
                    : `bg-[transparent] ${dark_font_style}`
                  }
            ${isDark ? "border-[rgba(56,56,56,1)]" : "border-[rgba(229,229,229,1)]"}`
          }
          onClick={() => setActiveTab("1")}
        >
          {tab1Label}
        </div>

        <div
          className={`
            flex items-center justify-center 
            w-[48%] -mr-0.5
            py-1 px-4 
            border rounded 
            cursor-pointer 
            font-medium text-xs gap-1 
            ${activeTab === "2"
              ? `${button_primary_color} !text-white`
              : `bg-[transparent] ${dark_font_style}`
            }
            ${isDark ? "border-[rgba(56,56,56,1)]" : "border-[rgba(229,229,229,1)]"}`
          }
          onClick={() => setActiveTab("2")}
        >
          {tab2Label}
        </div>
      </div>
    );
  };

  const tabItems: TabsProps["items"] = [
    {
      key: "1",
      label: tab1Label,
      children: tab1Content,
    },
    {
      key: "2",
      label: tab2Label,
      children: tab2Content,
    },
  ];

  return (
    <Tabs
      items={tabItems}
      activeKey={activeTab}
      renderTabBar={renderCustomTabBar}
      tabBarStyle={{
        margin: 0,
        padding: "0 0px",
        backgroundColor: "#fff",
      }}
      indicator={{
        size: 0,
      }}
    />
  );
};

export default SideTabs;