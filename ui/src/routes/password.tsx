import { ActionFunctionArgs, redirect, useActionData, useSubmit } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { Button, Typography, Form, Input, Image, InputRef } from "antd";
import { isMobile } from "react-device-detect";

import LogoLuckfox from "@assets/logo-luckfox.png";
import api from "@/api";
import { DEVICE_API } from "@/ui.config";
import DashboardNavbar from "@components/Header/Header";
import { DeviceStatus } from "@routes/login_page/index";
import { text_color } from "@/layout/theme_color";

import { useThemeSettings, useLanguageSettings } from "./login_page/useLocalAuth";

const { Title, Text } = Typography;
const loader = async () => {
  const res = await api
    .GET(`${DEVICE_API}/device/status`)
    .then(res => res.json() as Promise<DeviceStatus>);

  if (res.isSetup) return redirect("/login-local");
  return null;
};

const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  try {
    const response = await api.POST(`${DEVICE_API}/device/setup`, {
      localAuthMode: "password",
      password,
    });

    if (response.ok) {
      return redirect("/");
    } else {
      const errorData = await response.json();
      return { error: errorData.message || "Failed to set password" };
    }
  } catch (error) {
    console.error("Error setting password:", error);
    return { error: "An error occurred while setting the password" };
  }
};

export default function PassWordPage() {
  const { $at } = useLanguageSettings();
  const { isDark } = useThemeSettings();
  const actionData = useActionData() as { error?: string };
  const [showPassword, setShowPassword] = useState(false);
  const [form] = Form.useForm();
  const submit = useSubmit();
  const passwordInputRef = useRef<InputRef>(null);

  // Focus password input after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const onFinish = (values: { password: string; confirmPassword: string }) => {
    const formData = new FormData();
    formData.append("password", values.password);
    formData.append("confirmPassword", values.confirmPassword);
    submit(formData, { method: "post" });
  };

  return (
    <div className={"h-full w-full flex flex-col"}>
      <DashboardNavbar isLoggedIn={false} />

      <div
        className={`flex justify-center items-center flex-col h-full w-full bg-[rgba(249,249,249,1)] dark:bg-black`}
        style={{ textAlign: "center" }}
      >
        <div className={`flex justify-between items-center flex-col ${isMobile ? "w-[100%] h-[60%] px-[20px]" : "w-[50%] h-[60%]"}`}>
          <div>
            <Image src={LogoLuckfox} preview={false} style={{ width: 48, height: 48, marginBottom: 16 }} />
            <Title level={3} style={{ margin: 0, color: isDark ? "#FFF" : "#000" }}>
              {$at("Set a Password")}
            </Title>
            <Text style={{ color: isDark ? "#AAA" : "#666", fontSize: 14 }}>
              {$at("Create a strong password to secure your KVM device locally.")}
            </Text>
          </div>

          <Form
            form={form}
            name="passwordForm"
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            className={isMobile ? "w-full" : "w-[60%]"}
          >
            <Form.Item
              name="password"
              label={$at("Password")}
              rules={[
                { required: true, message: $at("Please enter a password") },
              ]}
            >
              <div style={{ position: "relative" }}>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={$at("Enter a password")}
                  autoComplete="new-password"
                  ref={passwordInputRef}
                  size="large"
                  style={{ paddingRight: 40 }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    cursor: "pointer",
                    zIndex: 2,
                  }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <LuEye className="h-4 w-4 text-slate-500 dark:text-[#ffffff]" />
                  ) : (
                    <LuEyeOff className="h-4 w-4 text-slate-500 dark:text-[#ffffff]" />
                  )}
                </div>
              </div>
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={$at("Confirm Password")}
              dependencies={["password"]}
              rules={[
                { required: true, message: $at("Please confirm your password") },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error($at("Passwords do not match")));
                  },
                }),
              ]}
            >
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={$at("Confirm your password")}
                size="large"
              />
            </Form.Item>

            {actionData?.error && (
              <div style={{ color: "#ff4d4f", marginBottom: 16, textAlign: "center" }}>
                {actionData.error}
              </div>
            )}

            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 6,
                  border: "none",
                  fontWeight: 500,
                }}
              >
                {$at("Set Password")}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: "center" }}>
            <div className={`text-xs leading-[18px] ${text_color} px-1`}>
              {$at("This password will be used to secure your device data and protect against unauthorized access.")}
            </div>
            <br />
            <div className={`text-xs leading-[18px] ${text_color} px-1`}>
              {$at("All data remains on your local device.")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
PassWordPage.action = action;
PassWordPage.loader = loader;