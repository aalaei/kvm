import { LuTrash2 } from "react-icons/lu";
import { Button as AntdButton } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import { isMobile } from "react-device-detect";

import Card from "@components/Card";
import { FieldError } from "@components/InputField";
import { text_primary_color } from "@/layout/theme_color";

export interface StoredDevice {
  name: string;
  macAddress: string;
}

interface DeviceListProps {
  storedDevices: StoredDevice[];
  errorMessage: string | null;
  onSendMagicPacket: (macAddress: string) => void;
  onDeleteDevice: (index: number) => void;
  onCancelWakeOnLanModal: () => void;
  setShowAddForm: (show: boolean) => void;
}

export default function DeviceList({
                                     storedDevices,
                                     errorMessage,
                                     onSendMagicPacket,
                                     onDeleteDevice,
                                     setShowAddForm,
                                   }: DeviceListProps) {
  const { $at } = useReactAt();

  return (
    <div className="space-y-4">
      {storedDevices.length > 0 &&
        <Card className="animate-fadeIn opacity-0">
          <div className="w-full divide-y divide-slate-700/30 dark:divide-slate-600/30">
            {storedDevices.map((device, index) => (
              <div key={index} className="flex items-center justify-between gap-x-2 p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold leading-none text-slate-900 dark:text-slate-100">
                    {device?.name}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {device.macAddress?.toLowerCase()}
                  </p>
                </div>

                {errorMessage && <FieldError error={errorMessage} />}
                <div className="flex items-center space-x-2">
                  <AntdButton
                    type="primary"
                    onClick={() => onSendMagicPacket(device.macAddress)}
                  >{$at("Wake")}</AntdButton>
                  <AntdButton
                    type="primary"
                    danger={true}
                    icon={<LuTrash2 />}
                    onClick={() => onDeleteDevice(index)}
                    aria-label={$at("Delete device")}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>}
      <Card className="animate-fadeIn opacity-0">
        <div className="w-full divide-y divide-slate-700/30 dark:divide-slate-600/30">

          <div className="flex items-center justify-between gap-x-2 p-5">
            <div className="w-full">
              <div
                className={`custom-text flex items-center justify-center  
                rounded cursor-pointer transition-colors
                text-center font-normal leading-[18px] font-['Microsoft_YaHei_UI'] 
                ${text_primary_color}
                ${isMobile ? "text-[12px]" : "text-[14px]"}`}
                onClick={() => setShowAddForm(true)}>
                {$at("+ Add a device to start using Wake-on-LAN")}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
