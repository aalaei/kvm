import { useCallback, useEffect, useState } from "react";
import { useClose } from "@headlessui/react";
import { useReactAt } from "i18n-auto-extractor/react";
import { Layout } from "antd";

import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { useRTCStore, useUiStore } from "@/hooks/stores";
import notifications from "@/notifications";
import AddDeviceForm from "@components/WakeOnLan/AddDeviceForm";
import DeviceList, { StoredDevice } from "@components/WakeOnLan/DeviceList";
import { dark_bg2_style} from "@/layout/theme_color";


export default function WakeOnLan() {
  const [storedDevices, setStoredDevices] = useState<StoredDevice[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const setDisableFocusTrap = useUiStore(state => state.setDisableVideoFocusTrap);

  const rpcDataChannel = useRTCStore(state => state.rpcDataChannel);

  const [send] = useJsonRpc();
  const close = useClose();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addDeviceErrorMessage, setAddDeviceErrorMessage] = useState<string | null>(null);
  const { $at } = useReactAt();

  const onCancelWakeOnLanModal = useCallback(() => {
    close();
    setDisableFocusTrap(false);
  }, [close, setDisableFocusTrap]);

  const onSendMagicPacket = useCallback(
    (macAddress: string) => {
      setErrorMessage(null);
      if (rpcDataChannel?.readyState !== "open") return;

      send("sendWOLMagicPacket", { macAddress }, resp => {
        if ("error" in resp) {
          const isInvalid = resp.error.data?.includes("invalid MAC address");
          if (isInvalid) {
            setErrorMessage("Invalid MAC address");
          } else {
            setErrorMessage("Failed to send Magic Packet");
          }
        } else {
          notifications.success("Magic Packet sent successfully");
          setDisableFocusTrap(false);
          close();
        }
      });
    },
    [close, rpcDataChannel?.readyState, send, setDisableFocusTrap],
  );

  const syncStoredDevices = useCallback(() => {
    send("getWakeOnLanDevices", {}, resp => {
      if ("result" in resp) {
        setStoredDevices(resp.result as StoredDevice[]);
      } else {
        console.error("Failed to load Wake-on-LAN devices:", resp.error);
      }
    });
  }, [send, setStoredDevices]);

  // Load stored devices from the backend
  useEffect(() => {
    syncStoredDevices();
  }, [syncStoredDevices]);

  const onDeleteDevice = useCallback(
    (index: number) => {
      const updatedDevices = storedDevices.filter((_, i) => i !== index);

      send("setWakeOnLanDevices", { params: { devices: updatedDevices } }, resp => {
        if ("error" in resp) {
          console.error("Failed to update Wake-on-LAN devices:", resp.error);
        } else {
          syncStoredDevices();
        }
      });
    },
    [storedDevices, send, syncStoredDevices],
  );

  const onAddDevice = useCallback(
    (name: string, macAddress: string) => {
      if (!name || !macAddress) return;
      const updatedDevices = [...storedDevices, { name, macAddress }];
      console.log("updatedDevices", updatedDevices);
      send("setWakeOnLanDevices", { params: { devices: updatedDevices } }, resp => {
        if ("error" in resp) {
          console.error("Failed to add Wake-on-LAN device:", resp.error);
          setAddDeviceErrorMessage("Failed to add device");
        } else {
          setShowAddForm(false);
          syncStoredDevices();
        }
      });
    },
    [send, storedDevices, syncStoredDevices],
  );

  return (
    <Layout className={`space-y-4 ${dark_bg2_style}`}>
      <SettingsPageHeader
        title={$at("Wake On LAN")}
        description={$at("Send a Magic Packet to wake up a remote device")}
      />

      {showAddForm ? (
        <AddDeviceForm
          setShowAddForm={setShowAddForm}
          errorMessage={addDeviceErrorMessage}
          setErrorMessage={setAddDeviceErrorMessage}
          onAddDevice={onAddDevice}
        />
      ) : (
        <DeviceList
          storedDevices={storedDevices}
          errorMessage={errorMessage}
          onSendMagicPacket={onSendMagicPacket}
          onDeleteDevice={onDeleteDevice}
          onCancelWakeOnLanModal={onCancelWakeOnLanModal}
          setShowAddForm={setShowAddForm}
        />
      )} 
    </Layout>
  );
}
