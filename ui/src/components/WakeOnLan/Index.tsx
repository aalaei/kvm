import { useCallback, useEffect, useState } from "react";
import { useClose } from "@headlessui/react";
import {useReactAt} from 'i18n-auto-extractor/react'

import { Button } from "@components/Button";
import { GridCard } from "@components/Card";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { useRTCStore, useUiStore } from "@/hooks/stores";
import notifications from "@/notifications";

import EmptyStateCard from "./EmptyStateCard";
import DeviceList, { StoredDevice } from "./DeviceList";
import AddDeviceForm from "./AddDeviceForm";

export default function WakeOnLanModal() {
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

  const onSendUsbWakeupSignal = useCallback(() => {
    send("sendUsbWakeupSignal", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to send USB wakeup signal: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
    });
  }, [send]);

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
    <GridCard>
      <div className="space-y-4 p-4 py-3">
        <div className="grid h-full grid-rows-(--grid-headerBody)">
          <div className="space-y-4">
            <SettingsPageHeader
              title={$at("Wake On USB")}
              description={$at("Send a Signal to wake up the device connected via USB.")}
            />
 
            <div
              className="flex animate-fadeIn opacity-0 items-center justify-end space-x-2"
              style={{
                animationDuration: "0.7s",
                animationDelay: "0.2s",
              }}
            >
              <Button
                size="SM"
                theme="primary"
                text={$at("Wake")}
                onClick={onSendUsbWakeupSignal}
              />
            </div>

            <SettingsPageHeader
              title={$at("Wake On LAN")}
              description={$at("Send a Magic Packet to wake up a remote device.")}
            />

            {showAddForm ? (
              <AddDeviceForm
                setShowAddForm={setShowAddForm}
                errorMessage={addDeviceErrorMessage}
                setErrorMessage={setAddDeviceErrorMessage}
                onAddDevice={onAddDevice}
              />
            ) : storedDevices.length === 0 ? (
              <EmptyStateCard
                onCancelWakeOnLanModal={onCancelWakeOnLanModal}
                setShowAddForm={setShowAddForm}
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
          </div>
        </div>
      </div>
    </GridCard>
  );
}
