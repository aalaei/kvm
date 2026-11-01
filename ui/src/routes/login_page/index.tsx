import { Radio, Button, Typography, Image } from "antd";
import { ActionFunctionArgs, redirect } from "react-router-dom";
import { isMobile } from 'react-device-detect';

import LogoLuckfox from "@assets/logo-luckfox.png";
import AuthMethodCard, { AuthenticationMethod } from "@routes/login_page/AuthMethodCard";
import api from "@/api";
import { DEVICE_API } from "@/ui.config";
import DashboardNavbar from "@components/Header/Header";
import { button_primary_color, text_color } from "@/layout/theme_color";

import { useLocalAuthLogic, useThemeSettings, useLanguageSettings } from "./useLocalAuth";
const { Title, Text } = Typography;

export interface DeviceStatus {
  isSetup: boolean;
}

export const loader = async () => {
  const res = await api
    .GET(`${DEVICE_API}/device/status`)
    .then(res => res.json() as Promise<DeviceStatus>);

  if (!res.isSetup) return redirect("/mode");
 
  const deviceRes = await api.GET(`${DEVICE_API}/device`);
  if (deviceRes.ok) return redirect("/");
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const localAuthMode = formData.get("localAuthMode");
  if (!localAuthMode) return { error: "Please select an authentication mode" };

  if (localAuthMode === "password") {
    return redirect("/mode/password");
  }

  if (localAuthMode === "noPassword") {
    try {
      await api.POST(`${DEVICE_API}/device/setup`, {
        localAuthMode,
      });
      return redirect("/");
    } catch (error) {
      console.error("Error SettingsModal authentication mode:", error);
      return { error: "An error occurred while SettingsModal the authentication mode" };
    }
  }

  return { error: "Invalid authentication mode" };
};

export default function LocalAuthPage() {
  const { $at } = useLanguageSettings();
  const { isDark } = useThemeSettings();
  const { selectedMethod, error, loading, handleMethodSelect, handleContinue } = useLocalAuthLogic();

  const authMethods: AuthenticationMethod[] = [
    {
      value: "password",
      label: $at("Password protected"),
      description: $at("Secure your device with a password for added protection."),
    },
    {
      value: "no-password",
      label: $at("No Password"),
      description: $at("Quick access without password authentication."),
    },
  ];
//background: isDark ? "#000" : "#EEE"
  return (
    <div className={"h-full w-full flex flex-col"}>
      <DashboardNavbar isLoggedIn={false} />

      <div className={`flex justify-center items-center flex-col h-full w-full bg-[rgba(249,249,249,1)] dark:bg-black`} style={{ textAlign: "center" }}>
        <div
          className={`flex justify-between items-center flex-col ${isMobile ? "w-[100%] h-[60%] px-[20px]" : "w-[50%] h-[60%]"}`}>
          <div>
            <Image
              src={LogoLuckfox}
              preview={false}
              style={{ width: 48, height: 48, marginBottom: 16 }}
            />
            <Title level={3} style={{
              margin: 0,
              color: isDark ? "#FFF" : "#000",
            }}>
              {$at("Local Authentication Method")}
            </Title>
            <Text style={{
              color: isDark ? "#AAA" : "#666",
              fontSize: 14,
            }}>
              {$at("Select how you would like to secure your KVM device locally.")}
            </Text>
          </div>

          {error && (
            <div style={{
              color: "red",
              marginBottom: 16,
              padding: "8px 16px",
              backgroundColor: "#fff2f0",
              border: "1px solid #ffccc7",
              borderRadius: 4,
            }}>
              {error}
            </div>
          )}

          <div style={{ width: "100%" }}>
            <Radio.Group
              value={selectedMethod}
              onChange={(e) => handleMethodSelect(e.target.value)}
              style={{ width: "100%" }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: "stretch",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                {authMethods.map((method) => (
                  <AuthMethodCard
                    key={method.value}
                    method={method}
                    selectedValue={selectedMethod}
                    onSelect={handleMethodSelect}
                  />
                ))}
              </div>
            </Radio.Group>
          </div>
          <div className={"h-[30px]"}></div>
          <Button
            type={"text"}
            className={`${button_primary_color} !h-[49px]`}
            style={{
              width: "100%",
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 500,
              color: "white",
            }}
            onClick={handleContinue}
            loading={loading}
            disabled={!selectedMethod || loading}
          >
            {$at("Continue")}
          </Button>
          <div className={"h-[30px]"}></div>
          <div className={`text-xs leading-[18px] ${text_color} px-1 `}>
            {$at("You can always change your authentication method later in the settings.")}
          </div>
        </div>
      </div>
    </div>
  );
}
LocalAuthPage.action = action;
LocalAuthPage.loader = loader;