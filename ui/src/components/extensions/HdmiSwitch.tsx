import { useCallback, useEffect, useState } from "react";
import { LuMonitor } from "react-icons/lu";

import { Button } from "@components/Button";
import Card from "@components/Card";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { cx } from "@/cva.config";

interface HDMISwitchState {
  currentPort: number;
  portNames: string[];
  available: boolean;
}

export function HdmiSwitch() {
  const [send] = useJsonRpc();
  const [state, setState] = useState<HDMISwitchState>({
    currentPort: 0,
    portNames: ["", "", "", "", ""],
    available: false,
  });
  const [switching, setSwitching] = useState<number | null>(null);

  const fetchState = useCallback(() => {
    send("getHDMISwitchState", {}, resp => {
      if ("error" in resp) return;
      setState(resp.result as HDMISwitchState);
    });
  }, [send]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const handleSwitch = (port: number) => {
    setSwitching(port);
    send("setHDMIPort", { port }, resp => {
      setSwitching(null);
      if ("error" in resp) {
        notifications.error(
          `Failed to switch HDMI: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setState(prev => ({ ...prev, currentPort: port }));
    });
  };

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="HDMI Switch"
        description="Select the active HDMI input on the ESP switch"
      />
      <hr className="border-slate-700/30 dark:border-slate-600/30" />

      {!state.available && (
        <p className="text-sm text-amber-500 dark:text-amber-400">
          Switch offline — retrying…
        </p>
      )}

      <Card className="animate-fadeIn opacity-0">
        <div className="divide-y divide-slate-700/30 dark:divide-slate-600/30">
          {[1, 2, 3, 4, 5].map(port => {
            const name = state.portNames[port - 1] || `HDMI ${port}`;
            const isActive = state.currentPort === port;
            const isSwitching = switching === port;

            return (
              <div key={port} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <LuMonitor
                    className={cx("h-4 w-4", {
                      "text-blue-500": isActive,
                      "text-slate-400 dark:text-slate-500": !isActive,
                    })}
                  />
                  <div>
                    <p className="text-sm font-semibold leading-none text-slate-900 dark:text-slate-100">
                      HDMI {port}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {name}
                    </p>
                  </div>
                  {isActive && (
                    <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      Active
                    </span>
                  )}
                </div>
                <Button
                  size="XS"
                  theme={isActive ? "primary" : "light"}
                  text={isSwitching ? "Switching…" : isActive ? "Active" : "Select"}
                  disabled={isActive || switching !== null}
                  onClick={() => handleSwitch(port)}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
