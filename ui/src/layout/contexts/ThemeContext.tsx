// contexts/ThemeContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { theme, ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';

import { primary_color, primary_dark_color } from "@/layout/theme_color";

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) || 'light';
  });

  const isDark = themeMode === 'dark';

  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? primary_dark_color : primary_color,
      colorPrimaryActive: isDark ? primary_dark_color : primary_color,
      colorPrimaryBgHover: isDark ? primary_dark_color : primary_color,
      colorBgSolidActive: isDark ? primary_dark_color : primary_color,
      borderRadius: 6,
    },
    components: {
      Select: {
        colorText: isDark ? '#fff' : '#000',
        colorBgContainer: isDark ? 'rgba(26,26,26,1)' : '#ffffff',
        algorithm: true,
        colorFillContentHover: isDark ? primary_dark_color : primary_color,
        colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
      },
      Input: {
        colorText: isDark ? '#fff' : '#000',
        colorBgContainer: isDark ? 'rgba(26,26,26,1)' : '#ffffff',
        algorithm: true,
      },
      Button: {
        colorPrimary: isDark ? primary_dark_color : primary_color,
        colorFillContentHover: isDark ? primary_dark_color : primary_color,
        colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
      },
      Checkbox: {
        colorPrimary: isDark ? primary_dark_color : primary_color,
        colorFillContentHover: isDark ? primary_dark_color : primary_color,
        colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
      },
      Slider: {
        colorBgElevated: isDark ? primary_dark_color : primary_color,
        dotActiveBorderColor: isDark ? primary_dark_color : primary_color,
        dotBorderColor: isDark ? primary_dark_color : primary_color,
        handleColor: isDark ? primary_dark_color : primary_color,
        handleActiveOutlineColor: isDark ? primary_dark_color : primary_color,
        handleActiveColor: isDark ? primary_dark_color : primary_color,
        colorBgContainer: isDark ? primary_dark_color : primary_color,
        railBg: isDark ? 'rgba(56,56,56,1)' : 'rgba(229,229,229,1)',
        railHoverBg: isDark ? 'rgba(56,56,56,1)' : 'rgba(229,229,229,1)',
        trackBg: isDark ? primary_dark_color : primary_color,
        trackHoverBg: isDark ? primary_dark_color : primary_color,
        colorFillContentHover: isDark ? primary_dark_color : primary_color,
        colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
        railSize: 8,
        handleLineWidth: 2,
        handleLineWidthHover: 2,
        controlSize: 24,
      },
      Menu: {
        itemMarginBlock: 0,
        itemMarginInline: 0,
        padding: 8,
        margin: 0
      },
    },
  });

  useEffect(() => {
    setThemeConfig({
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: isDark ? primary_dark_color : primary_color,
        colorPrimaryActive: isDark ? primary_dark_color : primary_color,
        colorPrimaryBgHover: isDark ? primary_dark_color : primary_color,
        colorBgSolidActive: isDark ? primary_dark_color : primary_color,
        borderRadius: 6,
      },
      components: {
        Select: {
          colorText: isDark ? '#fff' : '#000',
          colorBgContainer: isDark ? 'rgba(26,26,26,1)' : '#ffffff',
          algorithm: true,
          colorFillContentHover: isDark ? primary_dark_color : primary_color,
          colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
        },
        Input: {
          colorText: isDark ? '#fff' : '#000',
          colorBgContainer: isDark ? 'rgba(26,26,26,1)' : '#ffffff',
          algorithm: true,
        },
        Button: {
          colorPrimary: isDark ? primary_dark_color : primary_color,
          colorFillContentHover: isDark ? primary_dark_color : primary_color,
          colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
        },
        Checkbox: {
          colorPrimary: isDark ? primary_dark_color : primary_color,
          colorFillContentHover: isDark ? primary_dark_color : primary_color,
          colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
        },
        Slider: {
          colorBgElevated: isDark ? primary_dark_color : primary_color,
          dotActiveBorderColor: isDark ? primary_dark_color : primary_color,
          dotBorderColor: isDark ? primary_dark_color : primary_color,
          handleColor: isDark ? primary_dark_color : primary_color,
          handleActiveOutlineColor: isDark ? primary_dark_color : primary_color,
          handleActiveColor: isDark ? primary_dark_color : primary_color,
          colorBgContainer: isDark ? primary_dark_color : primary_color,
          railBg: isDark ? 'rgba(56,56,56,1)' : 'rgba(229,229,229,1)',
          railHoverBg: isDark ? 'rgba(56,56,56,1)' : 'rgba(229,229,229,1)',
          trackBg: isDark ? primary_dark_color : primary_color,
          trackHoverBg: isDark ? primary_dark_color : primary_color,
          colorFillContentHover: isDark ? primary_dark_color : primary_color,
          colorPrimaryBorderHover: isDark ? primary_dark_color : primary_color,
          railSize: 8,
          handleLineWidth: 2,
          handleLineWidthHover: 2,
          controlSize: 24,
        },
        Menu: {
          itemMarginBlock: 0,
          itemMarginInline: 0,
          padding: 8,
          margin: 0
        },
      },
    });
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('theme', themeMode);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [themeMode, isDark]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, isDark }}>
      <ConfigProvider theme={themeConfig}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};