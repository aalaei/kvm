import React from 'react';
import { CheckOutlined } from '@ant-design/icons';
import { isMobile } from "react-device-detect";

import { dark_bg2_style,  dark_font_style } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";


export interface Option {
  label: string;
  value: string;
}

interface ScrollThrottlingSelectProps {
  mode?: 'single' | 'multiple';
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  options?: Option[];
  title?: string;
  disabled?: boolean;
  specialOptionText?: string;
  specialOptionIcon?: React.ReactNode;
  onSpecialOptionClick?: () => void;
  maxShowCount?: number;
}

const defaultOptions: Option[] = [
  { label: 'off', value: 'off' },
];

const ScrollThrottlingSelect: React.FC<ScrollThrottlingSelectProps> = ({
                                                                         mode = 'single',
                                                                         value,
                                                                         onChange,
                                                                         options = defaultOptions,
                                                                         title = 'Scroll Throttling',
                                                                         disabled = false,
                                                                         specialOptionText,
                                                                         specialOptionIcon,
                                                                         onSpecialOptionClick,
                                                                         maxShowCount
                                                                       }) => {
  const { isDark } = useThemeSettings();
  const handleSingleSelect = (selectedValue: string) => {
    if (disabled) return;
    onChange?.(selectedValue);
  };

  const handleMultipleSelect = (selectedValue: string) => {
    if (disabled) return;

    const currentValues = Array.isArray(value) ? value : [];
    const newValues = currentValues.includes(selectedValue)
      ? currentValues.filter(v => v !== selectedValue)
      : [...currentValues, selectedValue];

    onChange?.(newValues);
  };

  const isSelected = (optionValue: string): boolean => {
    if (mode === 'single') {
      return value === optionValue;
    } else {
      return Array.isArray(value) && value.includes(optionValue);
    }
  };

  const handleSpecialOptionClick = () => {
    if (disabled) return;
    onSpecialOptionClick?.();
  };

  const getVisibleOptions = () => {
    if (!maxShowCount || maxShowCount >= options.length) {
      return {
        visibleOptions: options,
        hiddenCount: 0
      };
    }

    return {
      visibleOptions: options.slice(0, maxShowCount),
      hiddenCount: options.length - maxShowCount
    };
  };

  const { visibleOptions } = getVisibleOptions();

  if (isMobile) {
    return (
      <div className={`w-full ${dark_bg2_style}`}>
        <div
          className={`font-microsoft-yahei-ui text-base font-bold mb-2 ${dark_font_style}`}
        >
          {title}
        </div>

        <div className="flex flex-col">
          {visibleOptions.map(option => (
            <div
              key={option.value}
              onClick={() => mode === 'single'
                ? handleSingleSelect(option.value)
                : handleMultipleSelect(option.value)
              }
              className={`
                flex items-center justify-between py-4 w-full
                transition-all duration-200 ease-in-out
                ${isDark ? 'text-white' : 'text-black'}
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'}
              `}
            >
              <span className="font-normal tracking-[0.5px]">
                {option.label}
              </span>
              <span className={`
                text-lg transition-opacity duration-200 ease-in-out
                ${isDark ? 'text-white' : 'text-black'}
                ${isSelected(option.value) ? 'opacity-100' : 'opacity-0'}
              `}>
                ✓
              </span>
            </div>
          ))}

          {specialOptionText && (
            <div
              key="special-option"
              onClick={handleSpecialOptionClick}
              className={`
                flex items-center justify-between py-4 w-full
                transition-all duration-200 ease-in-out
                ${isDark ? 'text-white' : 'text-black'}
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'}
              `}
            >
              <span className="font-normal tracking-[0.5px]">
                {specialOptionText}
              </span>
              <span className={`
                text-lg transition-opacity duration-200 ease-in-out
                ${isDark ? 'text-white' : 'text-black'}
              `}>
                {specialOptionIcon}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{paddingLeft:4, paddingRight:4}} className={`w-full h-full ${dark_bg2_style}`}>
      <div
        className={`font-microsoft-yahei-ui text-xs font-bold leading-[15px] tracking-normal ${dark_font_style}`}
      >
        {title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column',}}>
        {visibleOptions.map(option => (
          <div
            key={option.value}
            onClick={() => mode === 'single'
              ? handleSingleSelect(option.value)
              : handleMultipleSelect(option.value)
            }
            className={`transition-colors duration-100 ease-in-out`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              fontWeight:400,
              borderRadius: 4,
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: '1px solid transparent',
              transition: 'background-color 0.1s ease-in-out',
            }}
            onMouseDown={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseUp={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
              }
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <span
              style={{
                color: disabled ? (isDark?'#fff':'#999') : (isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)'),
                fontSize: '12px',
                fontWeight: 500
              }}
              className={dark_font_style}
            >
              {option.label}
            </span>

            {isSelected(option.value) && (
              <CheckOutlined
                style={{
                  color: disabled ? (isDark?'#fff':'#999') : (isDark?'#fff':'#999'),
                  fontSize: '12px'
                }}
              />
            )}
          </div>
        ))}

        {specialOptionText && (
          <div
            key="special-option"
            onClick={handleSpecialOptionClick}
            className={`transition-colors duration-100 ease-in-out`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 4,
              cursor: disabled ? 'not-allowed' : 'pointer',
              backgroundColor: disabled ? '#f5f5f5' : 'transparent',
              border: '1px solid transparent',
              transition: 'background-color 0.1s ease-in-out',
              marginTop: specialOptionText ? 8 : 0,
            }}
            onMouseDown={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseUp={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
              }
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <span
              style={{
                color: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
                fontSize: '12px',
                fontWeight: 400
              }}
              className={dark_font_style}
            >
              {specialOptionText}
            </span>

            {specialOptionIcon && (
              <span style={{ fontSize: '12px' }}>
                {specialOptionIcon}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScrollThrottlingSelect;