import { useCallback, useEffect, useState } from "react";
import { LuMonitor, LuSettings } from "react-icons/lu";

import { Button } from "@components/Button";
import Card from "@components/Card";
import { InputFieldWithLabel } from "@components/InputField";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { cx } from "@/cva.config";

interface HDMISwitchState {
  currentPort: number;
  portNames: string[];
  available: boolean;
  lastError?: string;
}

interface HDMISwitchConfig {
  url: string;
  username: string;
  password?: string;
  hasPassword: boolean;
  clearPassword?: boolean;
}

function HdmiSwitchSettings({ onClose }: { onClose: () => void }) {
  const [send] = useJsonRpc();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    send("getHDMISwitchConfig", {}, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to load HDMI switch settings: ${resp.error.data || "Unknown error"}`);
        return;
      }
      const cfg = resp.result as HDMISwitchConfig;
      setUrl(cfg.url);
      setUsername(cfg.username);
      setHasPassword(cfg.hasPassword);
      setLoaded(true);
    });
  }, [send]);

  const formConfig = (): HDMISwitchConfig => ({
    url,
    username,
    password: clearPassword ? "" : password,
    hasPassword,
    clearPassword,
  });

  const handleTest = () => {
    setBusy("test");
    setTestResult(null);
    send("testHDMISwitchConfig", { config: formConfig() }, resp => {
      setBusy(null);
      if ("error" in resp) {
        setTestResult({ ok: false, msg: String(resp.error.data || resp.error.message || "Unknown error") });
        return;
      }
      setTestResult({ ok: true, msg: String(resp.result) });
    });
  };

  const handleSave = () => {
    setBusy("save");
    send("setHDMISwitchConfig", { config: formConfig() }, resp => {
      setBusy(null);
      if ("error" in resp) {
        notifications.error(`Failed to save HDMI switch settings: ${resp.error.data || "Unknown error"}`);
        return;
      }
      notifications.success("HDMI switch settings saved");
      onClose();
    });
  };

  const passwordPlaceholder = clearPassword
    ? "Password will be removed"
    : hasPassword
      ? "Saved — leave empty to keep"
      : "";

  return (
    <Card className="animate-fadeIn opacity-0">
      <form
        className="space-y-3 p-3"
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
      >
        <InputFieldWithLabel
          size="SM"
          label="Address"
          description="Hostname, mDNS name, IP, or full URL (e.g. esp-hdmi-mux.local, 192.0.2.10, http://host:8080)"
          placeholder="esp-hdmi-mux.local"
          value={url}
          disabled={!loaded}
          onChange={e => setUrl(e.target.value)}
        />
        <InputFieldWithLabel
          size="SM"
          label="Username"
          description="For the switch's web server basic auth. Leave empty if it has none."
          autoComplete="off"
          value={username}
          disabled={!loaded}
          onChange={e => setUsername(e.target.value)}
        />
        <InputFieldWithLabel
          size="SM"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder={passwordPlaceholder}
          value={password}
          disabled={!loaded || clearPassword || !username}
          onChange={e => setPassword(e.target.value)}
        />
        {hasPassword && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={e => {
                setClearPassword(e.target.checked);
                if (e.target.checked) setPassword("");
              }}
            />
            Remove saved password
          </label>
        )}

        {testResult && (
          <p
            className={cx("text-xs", {
              "text-green-600 dark:text-green-400": testResult.ok,
              "text-red-600 dark:text-red-400": !testResult.ok,
            })}
          >
            {testResult.msg}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button size="SM" theme="light" text="Cancel" type="button" onClick={onClose} />
          <Button
            size="SM"
            theme="light"
            type="button"
            text={busy === "test" ? "Testing…" : "Test"}
            disabled={!loaded || busy !== null}
            onClick={handleTest}
          />
          <Button
            size="SM"
            theme="primary"
            type="submit"
            text={busy === "save" ? "Saving…" : "Save"}
            disabled={!loaded || busy !== null}
          />
        </div>
      </form>
    </Card>
  );
}

export function HdmiSwitch() {
  const [send] = useJsonRpc();
  const [state, setState] = useState<HDMISwitchState>({
    currentPort: 0,
    portNames: ["", "", "", "", ""],
    available: false,
  });
  const [switching, setSwitching] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
      <div className="flex items-start justify-between gap-2">
        <SettingsPageHeader
          title="HDMI Switch"
          description="Select the active HDMI input on the ESP switch"
        />
        <Button
          size="XS"
          theme="light"
          LeadingIcon={LuSettings}
          text="Configure"
          onClick={() => setShowSettings(v => !v)}
        />
      </div>
      <hr className="border-slate-700/30 dark:border-slate-600/30" />

      {showSettings && (
        <HdmiSwitchSettings
          onClose={() => {
            setShowSettings(false);
            fetchState();
          }}
        />
      )}

      {!state.available && (
        <p className="text-sm text-amber-500 dark:text-amber-400">
          Switch offline — retrying…
          {state.lastError && (
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {state.lastError}
            </span>
          )}
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
                  disabled={isActive || switching !== null || !state.available}
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
