import { useState, useRef } from "react";
import { Button as AntdButton } from "antd";
import {useReactAt} from 'i18n-auto-extractor/react'
import { isMobile } from "react-device-detect";

import { InputFieldWithLabel } from "@components/InputField";

interface AddDeviceFormProps {
  onAddDevice: (name: string, macAddress: string) => void;
  setShowAddForm: (show: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (errorMessage: string | null) => void;
}

export default function AddDeviceForm({
  setShowAddForm,
  onAddDevice,
  errorMessage,
  setErrorMessage,
}: AddDeviceFormProps) {
  const [isDeviceNameValid, setIsDeviceNameValid] = useState<boolean>(false);
  const [isMacAddressValid, setIsMacAddressValid] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const macInputRef = useRef<HTMLInputElement>(null);
  const { $at }= useReactAt();

  return (
    <div className="space-y-4">
      <div
        className="animate-fadeIn opacity-0 space-y-4"
        style={{
          animationDuration: "0.5s",
          animationFillMode: "forwards",
        }}
      >
        <InputFieldWithLabel
          ref={nameInputRef}
          placeholder="Plex Media Server"
          label={ $at("Device Name") }
          required
          onChange={e => {
            setIsDeviceNameValid(e.target.validity.valid);
            setErrorMessage(null);
          }}
          maxLength={30}
        />
        <InputFieldWithLabel
          ref={macInputRef}
          placeholder="00:b0:d0:63:c2:26"
          label={ $at("MAC Address") }
          onKeyUp={e => e.stopPropagation()}
          required
          pattern="^([0-9a-fA-F][0-9a-fA-F]:){5}([0-9a-fA-F][0-9a-fA-F])$"
          error={errorMessage}
          onChange={e => {
            setIsMacAddressValid(e.target.validity.valid);
            setErrorMessage(null);
          }}
          minLength={17}
          maxLength={17}
          onKeyDown={e => {
            if (isMacAddressValid || isDeviceNameValid) {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const deviceName = nameInputRef.current?.value || "";
                const macAddress = macInputRef.current?.value || "";
                onAddDevice(deviceName, macAddress);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setShowAddForm(false);
              }
            }
          }}
        />
      </div>
      <div
        className={`flex animate-fadeIn opacity-0 items-center 
         space-x-2 ${isMobile? "justify-between" : "justify-start"}`}
        style={{
          animationDuration: "0.7s",
          animationDelay: "0.2s",
        }}
      >
        <AntdButton
          type="primary"
          disabled={!isDeviceNameValid || !isMacAddressValid}
          className={isMobile? "w-[49%]" : "w-[48px]"}
          onClick={() => {
            const deviceName = nameInputRef.current?.value || "";
            const macAddress = macInputRef.current?.value || "";
            onAddDevice(deviceName, macAddress);
          }}
        >{$at("Save")}</AntdButton>
        <AntdButton
          type="primary"
          className={isMobile? "w-[49%]" : "w-[48px]"}
          onClick={() => setShowAddForm(false)}
        >
          { $at("Back") }
        </AntdButton>

      </div>
    </div>
  );
}
