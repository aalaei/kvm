import React from "react";

import DeviceAwareComponent from "@/layout/contexts/DeviceAwareComponentProps";
import SettingsModalPC from "@/layout/components_setting/SettingsModalPC";
import SettingsModalMobile from "@/layout/components_setting/SettingsModalMobile";

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface SettingsDialogProps {
  visible?: boolean;
  onClose?: () => void;
}

const SettingsModal: React.FC<SettingsDialogProps> = ({ visible = true }) => {

  if (!visible) return null;

  return (
    <DeviceAwareComponent
      pcComponent={<SettingsModalPC visible={visible} />}
      mobileComponent={<SettingsModalMobile visible={visible}/>} />

  );
};


export default SettingsModal;
