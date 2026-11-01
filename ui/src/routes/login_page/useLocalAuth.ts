import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { message } from "antd";
import { useReactAt } from 'i18n-auto-extractor/react';

import api from "@/api";
import { DEVICE_API } from "@/ui.config";
import { ThemeMode, useTheme } from "@/layout/contexts/ThemeContext";
import { useSettingsStore } from "@/hooks/stores";

import enJSON from '../../locales/en.json';
import zhJSON from '../../locales/zh.json';

export const useLocalAuthLogic = () => {
  const { $at } = useReactAt();
  const navigate = useNavigate();
  const [selectedMethod, setSelectedMethod] = useState<string>("password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleMethodSelect = useCallback((value: string) => {
    setSelectedMethod(value);
    setError(null);
  }, []);

  const handleContinue = useCallback(async () => {
    setError(null);

    if (!selectedMethod) {
      setError($at("Please select an authentication mode"));
      return;
    }

    let localAuthMode = selectedMethod;
    if (selectedMethod === "no-password") {
      localAuthMode = "noPassword";
    }

    setLoading(true);

    try {
      if (localAuthMode === "password") {
        navigate("/mode/password");
        return;
      }

      if (localAuthMode === "noPassword") {
        await api.POST(`${DEVICE_API}/device/setup`, {
          localAuthMode,
        });
        navigate("/");
        return;
      }

      setError($at("Invalid authentication mode"));
    } catch (error) {
      console.error("Error setting authentication mode:", error);
      const errorMsg = $at("An error occurred while setting the authentication mode");
      setError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [selectedMethod, navigate, $at]);

  return {
    selectedMethod,
    error,
    loading,
    handleMethodSelect,
    handleContinue
  };
};

export const useThemeSettings = () => {
  const { setThemeMode, isDark } = useTheme();
  const [theme, setTheme] = useState<string>("light");

  const handleThemeChange = useCallback((value: string) => {
    const root = document.documentElement;
    setThemeMode(value as ThemeMode);

    localStorage.setItem('theme', value);
    root.classList.remove('light', 'dark');
    root.classList.add(value);

    setTheme(value);
  }, [setThemeMode]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(savedTheme);

  }, []);

  return {
    theme,
    isDark,
    handleThemeChange
  };
};

export const useLanguageSettings = () => {
  const { $at, setCurrentLang } = useReactAt();
  const language = useSettingsStore(state => state.language);
  const setLanguageInStore = useSettingsStore(state => state.setLanguage);

  useEffect(() => {
    setCurrentLang(language, language === 'en' ? enJSON : zhJSON);
  }, [language, setCurrentLang]);

  const handleLanguageChange = useCallback((value: string) => {
    setLanguageInStore(value);
    setCurrentLang(value, value === 'en' ? enJSON : zhJSON);
  }, [setLanguageInStore, setCurrentLang]);

  return {
    $at,
    language,
    handleLanguageChange
  };
};