import React from "react";
import { Layout, Select, Typography, Space,theme as AntTheme } from "antd";

import LogoLuckfox from "@assets/logo-luckfox.png";
import DeviceAwareComponent from "@/layout/contexts/DeviceAwareComponentProps";
import { dark_bg_style_fun } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";

const { Header } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

interface SetupHeaderProps {
  $at: (key: string) => string;
  language: string;
  theme: string;
  handleLanguageChange: (value: string) => void;
  handleThemeChange: (value: string) => void;
}

const SetupHeader: React.FC<SetupHeaderProps> = ({
                                                   $at,
                                                   language,
                                                   theme,
                                                   handleLanguageChange,
                                                   handleThemeChange,
                                                 }) => {
  const token = AntTheme.useToken();
  const { isDark } = useThemeSettings();
  const pcView=()=> (
    <Header
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        height: "32px",
      }}
      className={dark_bg_style_fun(isDark)}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <img
          src={LogoLuckfox}
          alt="Luckfox"
          style={{ width: 24, height: 24, marginRight: 8 }}
        />
        <Title level={3} style={{ margin: 0,  fontSize: "18px", fontWeight: 600 }}>
          LUCKFOX
        </Title>
      </div>

      <Space size="middle">
        <Space size="small">
          <Text style={{ fontSize: "14px" }}>{$at("Language")}</Text>
          <Select
            value={language}
            onChange={handleLanguageChange}
            size="small"
          >
            <Option value="en">English</Option>
            <Option value="zh">中文</Option>
          </Select>
        </Space>

        <Space size="small">
          <Text style={{ fontSize: "14px" }}>{$at("Theme")}</Text>
          <Select
            value={theme}
            onChange={handleThemeChange}
            size="small"
          >
            <Option value="light">{$at("Light")}</Option>
            <Option value="dark">{$at("Dark")}</Option>
          </Select>
        </Space>
      </Space>
    </Header>
  );
  const mobileView=()=> (
    <Header
      style={{
        width:"100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        height: "48px",
        backgroundColor:token.token.colorBgContainer
      }}
    >

        <Space size="small">
          <Text style={{ fontSize: "14px" }}>{$at("Language")}</Text>
          <Select
            value={language}
            onChange={handleLanguageChange}
            size="small"
          >
            <Option value="en">English</Option>
            <Option value="zh">中文</Option>
          </Select>
        </Space>

        <Space size="small">
          <Text style={{ fontSize: "14px" }}>{$at("Theme")}</Text>
          <Select
            value={theme}
            onChange={handleThemeChange}
            size="small"
          >
            <Option value="light">{$at("Light")}</Option>
            <Option value="dark">{$at("Dark")}</Option>
          </Select>
        </Space>

    </Header>
  );
  return (
    <DeviceAwareComponent
      pcComponent={pcView()}
      mobileComponent={mobileView()} />
    )

};

export default SetupHeader;