import React, { useEffect, useState } from "react";
import { Button, Layout, Checkbox, theme as AntTheme , Divider } from "antd";
import { PoweroffOutlined, ReloadOutlined } from "@ant-design/icons";
import { GoDotFill } from "react-icons/go";
import { useReactAt } from "i18n-auto-extractor/react";

import { dark_bg2_style, dark_font_style } from "@/layout/theme_color";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { useSerialStore } from "@/hooks/stores";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";

const PowerControlUp: React.FC = () => {
  const { $at } = useReactAt(); 
  const [send] = useJsonRpc();
  const { isConnected } = useSerialStore();
  const [powerLed, setPowerLed] = useState(false);
  const [hddLed, setHddLed] = useState(false);
  const [isLatchMode, setIsLatchMode] = useState(false);
  const [powerState, setPowerState] = useState(false);
  const [resetState, setResetState] = useState(false);

  const updateLedStatus = () => {
    if (isConnected) {
      setPowerLed(false);
      setHddLed(false);
      return;
    }
    send("getIOInputStatus", {}, (resp) => {
      if ("result" in resp) {
        const { powerLed, hddLed } = resp.result as { powerLed: boolean; hddLed: boolean };
        setPowerLed(powerLed);
        setHddLed(hddLed);
      }
    });
  };

  useEffect(() => {
    updateLedStatus();
    const interval = setInterval(updateLedStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [isConnected]);

  const handlePowerClick = () => {
    if (isLatchMode) {
      const newState = !powerState;
      send("setIOStatus", { ioName: "power", status: newState }, (resp) => {
        if ("error" in resp) {
          notifications.error("Failed to set power status");
        } else {
          setPowerState(newState);
          notifications.success(newState ? "Power set to High" : "Power set to Low");
        }
      });
    } else {
      send("triggerPower", {}, (resp) => {
        if ("error" in resp) {
          notifications.error("Failed to trigger power");
        } else {
          notifications.success("Power triggered");
        }
      });
    }
  };

  const handleResetClick = () => {
    if (isLatchMode) {
      const newState = !resetState;
      send("setIOStatus", { ioName: "reset", status: newState }, (resp) => {
        if ("error" in resp) {
          notifications.error("Failed to set reset status");
        } else {
          setResetState(newState);
          notifications.success(newState ? "Reset set to High" : "Reset set to Low");
        }
      });
    } else {
      send("triggerReset", {}, (resp) => {
        if ("error" in resp) {
          notifications.error("Failed to trigger reset");
        } else {
          notifications.success("Reset triggered");
        }
      });
    }
  };

  return (

    <Layout className={dark_bg2_style}>
      <SettingsPageHeader
        title={$at("IO Control")}
        description={$at("Configure your io control settings")}
      />
      <div className="space-y-4 mt-4 flex items-center">
        <Checkbox checked={isLatchMode} onChange={(e) => setIsLatchMode(e.target.checked)}>
          {$at("Latch Mode")}
        </Checkbox>
      </div>
      <div style={{ width: "100%",display:"flex",flexDirection:"row",justifyContent: "space-between",marginTop:32 }}>
        <Button
          type={(isLatchMode && powerState === false) ? "default" : "primary"}
          danger={isLatchMode && powerState}
          icon={<PoweroffOutlined />}
          size="large"
          onClick={handlePowerClick}
          style={{
            width: "49%",
            height: 36,
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {$at("Power")}
        </Button>

        <Button
          type={(isLatchMode && resetState === false) ? "default" : "primary"}
          danger={isLatchMode && resetState}
          icon={<ReloadOutlined />}
          size="large"
          onClick={handleResetClick}
          style={{
            width: "49%",
            height: 36,
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {$at("Reset")}
        </Button>
      </div>

      {!isConnected && (
        <>
          <Divider style={{ marginTop: 32 }} />

          <div style={{ width: "100%", justifyContent: "space-between" }}>
            <div style={{
              width: "100%",
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
            }}>
              <div style={{
                width: "45%",
                height: 48,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <GoDotFill className={powerLed ? "text-green-500" : "text-gray-400"} />
                <span className={dark_font_style}>{$at("Power LED")}</span>
              </div>
              <div style={{
                width: "45%",
                height: 48,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <GoDotFill className={hddLed ? "text-green-500" : "text-gray-400"} />
                <span className={dark_font_style}>{$at("HDD LED")}</span>
              </div>
            </div>
          </div>
          <Divider style={{ marginTop: 0 }} />
        </>
      )}
    </Layout>

  )
    ;
};

export default PowerControlUp;