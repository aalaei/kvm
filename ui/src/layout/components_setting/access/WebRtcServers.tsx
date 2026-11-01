import { useEffect, useState } from "react";
import { useReactAt } from "i18n-auto-extractor/react";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import { Button } from "@components/Button";
import { InputField } from "@components/InputField";
import { SettingsItem } from "@components/Settings/SettingsView";

interface TurnServer {
  url: string;
  username: string;
  credential: string;
}

interface RtcServersConfig {
  stun: string;
  defaultStun: string;
  turnServers: TurnServer[] | null;
}

export default function WebRtcServersSettings() {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();

  const [stun, setStun] = useState("");
  const [defaultStun, setDefaultStun] = useState("");
  const [turnServers, setTurnServers] = useState<TurnServer[]>([]);

  useEffect(() => {
    send("getRtcServersConfig", {}, resp => {
      if ("error" in resp) {
        notifications.error(`${$at("Failed to load WebRTC servers")}: ${resp.error.data || $at("Unknown error")}`);
        return;
      }

      const cfg = resp.result as RtcServersConfig;
      setDefaultStun(cfg.defaultStun);
      setStun(cfg.stun || cfg.defaultStun);
      setTurnServers(cfg.turnServers ?? []);
    });
  }, [send]);

  const saveStun = (value: string) => {
    send("setStunServer", { stun: value }, resp => {
      if ("error" in resp) {
        notifications.error(`${$at("Failed to save STUN")}: ${resp.error.data || $at("Unknown error")}`);
        return;
      }

      setStun(value);
      notifications.success($at("STUN server saved"));
    });
  };

  const persistTurnServers = (servers: TurnServer[]) => {
    send("setTurnServers", { params: { servers } }, resp => {
      if ("error" in resp) {
        notifications.error(`${$at("Failed to save TURN")}: ${resp.error.data || $at("Unknown error")}`);
        return;
      }

      setTurnServers(servers);
      notifications.success($at("TURN servers saved"));
    });
  };

  const updateTurnRow = (index: number, field: keyof TurnServer, value: string) => {
    setTurnServers(prev => prev.map((server, i) => (i === index ? { ...server, [field]: value } : server)));
  };

  const addTurnRow = () => {
    setTurnServers(prev => [...prev, { url: "", username: "", credential: "" }]);
  };

  const deleteTurnRow = (index: number) => {
    persistTurnServers(turnServers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <SettingsItem
        title={$at("STUN Server")}
        description={$at("Public STUN server for NAT traversal")}
        noCol
      >
        <div className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
          <InputField
            value={stun}
            onChange={e => setStun(e.target.value)}
            placeholder={defaultStun}
            className="min-w-0"
          />
          <div className="flex shrink-0 gap-2">
            <Button size="MD" theme="primary" text={$at("Save")} onClick={() => saveStun(stun)} />
            <Button
              size="MD"
              theme="light"
              text={$at("Restore Default")}
              onClick={() => saveStun(defaultStun)}
            />
          </div>
        </div>
      </SettingsItem>

      <div className="space-y-0.5">
        <div className="text-base font-semibold text-black dark:text-white">
          {$at("TURN Servers")}
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-300">
          {$at("Used as relay when direct peer-to-peer connection fails")}
        </div>
      </div>

      <div className="space-y-3">
        {turnServers.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">{$at("No TURN servers configured")}</div>
        )}

        {turnServers.map((server, index) => (
          <div key={index} className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(120px,180px)_minmax(120px,180px)_auto]">
            <InputField
              value={server.url}
              onChange={e => updateTurnRow(index, "url", e.target.value)}
              placeholder="turn:turn.example.com:3478"
            />
            <InputField
              value={server.username}
              onChange={e => updateTurnRow(index, "username", e.target.value)}
              placeholder={$at("Username")}
            />
            <InputField
              value={server.credential}
              onChange={e => updateTurnRow(index, "credential", e.target.value)}
              placeholder={$at("Credential")}
              type="password"
            />
            <Button
              size="MD"
              theme="lightDanger"
              text={$at("Delete")}
              onClick={() => deleteTurnRow(index)}
            />
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button size="MD" theme="light" text={$at("Add TURN Server")} onClick={addTurnRow} />
          <Button
            size="MD"
            theme="primary"
            text={$at("Save TURN Servers")}
            onClick={() => persistTurnServers(turnServers)}
          />
        </div>
      </div>
    </div>
  );
}
