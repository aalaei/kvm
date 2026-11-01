import React from "react";
import { Layout, Typography } from "antd";
import { isMobile } from "react-device-detect";

import { useThemeSettings } from "@routes/login_page/useLocalAuth";
import {
  button_primary2_color,
  button_primary_color,
  dark_bd_primary_style,
  dark_bd_style,
  dark_bg2_style,
} from "@/layout/theme_color";

const { Text } = Typography;
export interface AuthenticationMethod {
  value: string;
  label: string;
  description: string;
}

export interface AuthMethodCardProps {
  method: AuthenticationMethod;
  selectedValue: string;
  onSelect: (value: string) => void;
}


const AuthMethodCard: React.FC<AuthMethodCardProps> = ({
                                                         method,
                                                         selectedValue,
                                                         onSelect,
                                                       }) => {
  const isSelected = selectedValue === method.value;
  const { isDark } = useThemeSettings();

  return (
    <div
      className={`
        ${isMobile ? "w-full min-h-[150px] px-[20px]" : "w-[49%] min-h-[200px]"} 
        p-2 pb-4 text-center rounded-s transition-all border duration-300 cursor-pointer flex flex-col justify-center items-center relative
    
        ${isSelected ? button_primary2_color : dark_bg2_style}
        ${isSelected ? dark_bd_primary_style : dark_bd_style}
        m-[5px]
      `}
      onClick={() => onSelect(method.value)}
    >
      <div className="flex flex-col justify-center items-center gap-2 flex-1">
        <Text strong className={`${isMobile ? "!text-[14px]" : "!text-[20px]"} text-center m-0 font-semibold`}>
          {method.label}
        </Text>
        <Text className={`!text-[12px] text-center m-0 leading-relaxed ${isDark ? "text-white" : "text-gray-600"}`}>
          {method.description}
        </Text>
      </div>

      <div className={`
  absolute ${isMobile ? "bottom-2 right-2" : "bottom-4 right-4"} 
  w-5 h-5 rounded-full border-[1px] p-0
  ${dark_bg2_style}
   ${isSelected ? dark_bd_primary_style : dark_bd_style}
  `}>
        {isSelected && (
          <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full ${button_primary_color}`} />
        )}
      </div>
    </div>
  );
};
export default AuthMethodCard;