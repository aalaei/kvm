import { useCallback, useEffect, useMemo, useState } from "react";
import { Button as AntdButton, Checkbox, Input, Modal, Select } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import { SettingsSectionHeader } from "@components/Settings/SettingsSectionHeader";
import { isMobile } from "react-device-detect";
import { SettingsItem } from "@components/Settings/SettingsView";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import notifications from "@/notifications";
import AutoHeight from "@components/AutoHeight";
import { GridCard } from "@components/Card";
import { ConfirmDialog } from "@components/ConfirmDialog";

type FirewallChain = "input" | "output" | "forward";
type FirewallAction = "accept" | "drop" | "reject";

export interface FirewallConfig {
  base: {
    inputPolicy: FirewallAction;
    outputPolicy: FirewallAction;
    forwardPolicy: FirewallAction;
  };
  rules: FirewallRule[];
  portForwards: FirewallPortRule[];
}

export interface FirewallRule {
  chain: FirewallChain;
  sourceIP: string;
  sourcePort?: number | null;
  protocols: string[];
  destinationIP: string;
  destinationPort?: number | null;
  action: FirewallAction;
  comment: string;
}

export interface FirewallPortRule {
  chain?: "output" | "prerouting" | "prerouting_redirect";
  managed?: boolean;
  sourcePort: number;
  protocols: string[];
  destinationIP: string;
  destinationPort: number;
  comment: string;
}

const defaultFirewallConfig: FirewallConfig = {
  base: { inputPolicy: "accept", outputPolicy: "accept", forwardPolicy: "accept" },
  rules: [],
  portForwards: [],
};

const actionOptions: { value: FirewallAction; label: string }[] = [
  { value: "accept", label: "Accept" },
  { value: "drop", label: "Drop" },
  { value: "reject", label: "Reject" },
];

const chainOptions: { value: FirewallChain; label: string }[] = [
  { value: "input", label: "Input" },
  { value: "output", label: "Output" },
  { value: "forward", label: "Forward" },
];

const commProtocolOptions = [
  { key: "any", label: "Any" },
  { key: "tcp", label: "TCP" },
  { key: "udp", label: "UDP" },
  { key: "icmp", label: "ICMP" },
  { key: "igmp", label: "IGMP" },
];

const portForwardProtocolOptions = [
  { key: "tcp", label: "TCP" },
  { key: "udp", label: "UDP" },
  { key: "sctp", label: "SCTP" },
  { key: "dccp", label: "DCCP" },
];

function formatProtocols(protocols: string[]) {
  if (!protocols?.length) return "-";
  if (protocols.includes("any")) return "Any";
  return protocols.map(p => p.toUpperCase()).join(", ");
}

function actionLabel(action: FirewallAction) {
  return actionOptions.find(o => o.value === action)?.label ?? action;
}

function chainLabel(chain: FirewallChain) {
  return chainOptions.find(o => o.value === chain)?.label ?? chain;
}

function portForwardChainLabel(chain: FirewallPortRule["chain"]) {
  switch (chain ?? "prerouting") {
    case "output":
      return "OUTPUT";
    case "prerouting_redirect":
      return "PREROUTING_REDIRECT";
    default:
      return "PREROUTING";
  }
}

function formatEndpoint(ip: string, port: number | null | undefined, anyText: string) {
  const t = (ip || "").trim();
  if (!t && (port === null || port === undefined)) return anyText;
  if (!t && port !== null && port !== undefined) return `${anyText}:${port}`;
  if (t && (port === null || port === undefined)) return t;
  return `${t}:${port}`;
}

function normalizePort(v: string) {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 65535) return null;
  return Math.trunc(n);
}

function normalizeRuleProtocols(list: string[]) {
  if (list.includes("any")) return ["any"];
  return list;
}

export default function FirewallSettings() {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();

  const [activeTab, setActiveTab] = useState<"base" | "rules" | "portForwards">(
    "base",
  );
  const [appliedConfig, setAppliedConfig] = useState<FirewallConfig>(defaultFirewallConfig);
  const [baseDraft, setBaseDraft] = useState<FirewallConfig["base"]>(
    defaultFirewallConfig.base,
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showBaseSubmitConfirm, setShowBaseSubmitConfirm] = useState(false);

  const [selectedRuleRows, setSelectedRuleRows] = useState<Set<number>>(new Set());
  const [selectedPortForwardRows, setSelectedPortForwardRows] = useState<Set<number>>(
    new Set(),
  );

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleEditingIndex, setRuleEditingIndex] = useState<number | null>(null);
  const [ruleDraft, setRuleDraft] = useState<FirewallRule>({
    chain: "input",
    sourceIP: "",
    sourcePort: null,
    protocols: ["any"],
    destinationIP: "",
    destinationPort: null,
    action: "accept",
    comment: "",
  });
  const [ruleSourcePortText, setRuleSourcePortText] = useState<string>("");
  const [ruleDestinationPortText, setRuleDestinationPortText] = useState<string>("");

  const [pfModalOpen, setPfModalOpen] = useState(false);
  const [pfEditingIndex, setPfEditingIndex] = useState<number | null>(null);
  const [pfDraft, setPfDraft] = useState<FirewallPortRule>({
    chain: "prerouting",
    sourcePort: 1,
    protocols: ["tcp"],
    destinationIP: "",
    destinationPort: 1,
    comment: "",
  });
  const [pfSourcePortText, setPfSourcePortText] = useState<string>("1");
  const [pfDestinationPortText, setPfDestinationPortText] = useState<string>("1");

  const fetchConfig = useCallback(() => {
    setLoading(true);
    send("getFirewallConfig", {}, resp => {
      setLoading(false);
      if ("error" in resp) {
        notifications.error(
          `${$at("Failed to get firewall config")}: ${resp.error.data || resp.error.message}`,
        );
        return;
      }
      const cfg = resp.result as FirewallConfig;
      setAppliedConfig(cfg);
      setBaseDraft(cfg.base);
      setSelectedRuleRows(new Set());
      setSelectedPortForwardRows(new Set());
    });
  }, [send, $at]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const hasBaseChanges = useMemo(() => {
    return JSON.stringify(appliedConfig.base) !== JSON.stringify(baseDraft);
  }, [appliedConfig.base, baseDraft]);

  const applyFirewallConfig = useCallback(
    (
      nextConfig: FirewallConfig,
      opts?: { onSuccess?: () => void; successText?: string },
    ) => {
      setApplying(true);
      send("setFirewallConfig", { config: nextConfig }, resp => {
        setApplying(false);
        if ("error" in resp) {
          notifications.error(
            `${$at("Failed to apply firewall config")}: ${resp.error.data || resp.error.message}`,
          );
          return;
        }
        setAppliedConfig(nextConfig);
        if (opts?.successText) notifications.success(opts.successText);
        if (opts?.onSuccess) opts.onSuccess();
      });
    },
    [send, $at],
  );

  const handleBaseSubmit = useCallback(() => {
    const nextConfig: FirewallConfig = { ...appliedConfig, base: baseDraft };
    applyFirewallConfig(nextConfig, {
      successText: $at("Firewall config applied"),
      onSuccess: () => {
        setShowBaseSubmitConfirm(false);
      },
    });
  }, [appliedConfig, baseDraft, applyFirewallConfig, $at]);

  const requestBaseSubmit = useCallback(() => {
    if (!hasBaseChanges) return;
    setShowBaseSubmitConfirm(true);
  }, [hasBaseChanges]);

  const openAddRule = () => {
    setRuleEditingIndex(null);
    setRuleDraft({
      chain: "input",
      sourceIP: "",
      sourcePort: null,
      protocols: ["any"],
      destinationIP: "",
      destinationPort: null,
      action: "accept",
      comment: "",
    });
    setRuleSourcePortText("");
    setRuleDestinationPortText("");
    setRuleModalOpen(true);
  };

  const openEditRule = (idx: number) => {
    const current = appliedConfig.rules[idx];
    if (!current) return;
    setRuleEditingIndex(idx);
    setRuleDraft({ ...current });
    setRuleSourcePortText(current.sourcePort ? String(current.sourcePort) : "");
    setRuleDestinationPortText(current.destinationPort ? String(current.destinationPort) : "");
    setRuleModalOpen(true);
  };

  const saveRuleDraft = () => {
    const next: FirewallRule = {
      ...ruleDraft,
      protocols: normalizeRuleProtocols(ruleDraft.protocols),
      sourcePort: normalizePort(ruleSourcePortText),
      destinationPort: normalizePort(ruleDestinationPortText),
      sourceIP: ruleDraft.sourceIP.trim(),
      destinationIP: ruleDraft.destinationIP.trim(),
      comment: ruleDraft.comment.trim(),
    };

    if (!next.protocols.length) {
      notifications.error($at("Please select protocol"));
      return;
    }

    if (!next.chain || !next.action) {
      notifications.error($at("Missing required fields"));
      return;
    }

    const rules = [...appliedConfig.rules];
    if (ruleEditingIndex === null) {
      rules.push(next);
    } else {
      rules[ruleEditingIndex] = next;
    }
    const nextConfig: FirewallConfig = {
      ...appliedConfig,
      rules,
    };
    applyFirewallConfig(nextConfig, {
      successText: $at("Firewall config applied"),
      onSuccess: () => {
        setRuleModalOpen(false);
        setSelectedRuleRows(new Set());
      },
    });
  };

  const deleteSelectedRules = () => {
    const idxs = [...selectedRuleRows.values()].sort((a, b) => a - b);
    if (!idxs.length) return;
    const nextRules = appliedConfig.rules.filter((_, i) => !selectedRuleRows.has(i));
    const nextConfig: FirewallConfig = {
      ...appliedConfig,
      rules: nextRules,
    };
    applyFirewallConfig(nextConfig, {
      successText: $at("Firewall config applied"),
      onSuccess: () => {
        setSelectedRuleRows(new Set());
      },
    });
  };

  const openAddPortForward = () => {
    setPfEditingIndex(null);
    setPfDraft({
      chain: "prerouting",
      sourcePort: 1,
      protocols: ["tcp"],
      destinationIP: "",
      destinationPort: 1,
      comment: "",
    });
    setPfSourcePortText("1");
    setPfDestinationPortText("1");
    setPfModalOpen(true);
  };

  const openEditPortForward = (idx: number) => {
    const current = appliedConfig.portForwards[idx];
    if (!current) return;
    if (current.managed === false) return;
    setPfEditingIndex(idx);
    const inferredChain =
      current.chain ??
      (current.destinationIP?.trim() === "0.0.0.0" || current.destinationIP?.trim() === "127.0.0.1"
        ? "output"
        : "prerouting");
    setPfDraft({
      ...current,
      chain: inferredChain,
      destinationIP:
        inferredChain === "output" || inferredChain === "prerouting_redirect"
          ? "0.0.0.0"
          : current.destinationIP?.trim() === "0.0.0.0" || current.destinationIP?.trim() === "127.0.0.1"
            ? ""
            : current.destinationIP,
    });
    setPfSourcePortText(String(current.sourcePort));
    setPfDestinationPortText(String(current.destinationPort));
    setPfModalOpen(true);
  };

  const savePortForwardDraft = () => {
    const srcPort = normalizePort(pfSourcePortText);
    const dstPort = normalizePort(pfDestinationPortText);
    if (!srcPort || !dstPort) {
      notifications.error($at("Invalid port"));
      return;
    }
    const next: FirewallPortRule = {
      ...pfDraft,
      sourcePort: srcPort,
      destinationPort: dstPort,
      destinationIP:
        (pfDraft.chain ?? "prerouting") === "output" ||
        (pfDraft.chain ?? "prerouting") === "prerouting_redirect"
          ? "0.0.0.0"
          : pfDraft.destinationIP.trim(),
      protocols: normalizeRuleProtocols(pfDraft.protocols).filter(p => p !== "any"),
      comment: pfDraft.comment.trim(),
    };
    const pfChain = next.chain ?? "prerouting";
    if (pfChain === "prerouting" && ["0.0.0.0", "127.0.0.1"].includes(next.destinationIP.trim())) {
      notifications.error($at("For PREROUTING, Destination IP must be a real host IP"));
      return;
    }

    if (pfChain === "prerouting" && !next.destinationIP) {
      notifications.error($at("Destination IP is required"));
      return;
    }
    if (!next.protocols.length) {
      notifications.error($at("Please select protocol"));
      return;
    }

    const items = [...appliedConfig.portForwards];
    if (pfEditingIndex === null) {
      items.push(next);
    } else {
      items[pfEditingIndex] = next;
    }
    const nextConfig: FirewallConfig = {
      ...appliedConfig,
      portForwards: items,
    };
    applyFirewallConfig(nextConfig, {
      successText: $at("Firewall config applied"),
      onSuccess: () => {
        setPfModalOpen(false);
        setSelectedPortForwardRows(new Set());
      },
    });
  };

  const deleteSelectedPortForwards = () => {
    const idxs = [...selectedPortForwardRows.values()].sort((a, b) => a - b);
    if (!idxs.length) return;
    const nextItems = appliedConfig.portForwards.filter((r, i) => {
      if (!selectedPortForwardRows.has(i)) return true;
      return r.managed === false;
    });
    const nextConfig: FirewallConfig = {
      ...appliedConfig,
      portForwards: nextItems,
    };
    applyFirewallConfig(nextConfig, {
      successText: $at("Firewall config applied"),
      onSuccess: () => {
        setSelectedPortForwardRows(new Set());
      },
    });
  };

  return (
    <div className="space-y-2">
      <SettingsItem
        title={$at("Firewall")}
        badge="Experimental"
        description={$at("Manage the firewall rules of the device")}
      >
      </SettingsItem>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max">
          {[
            { id: "base", label: $at("Basic") },
            { id: "rules", label: $at("Communication Rules") },
            { id: "portForwards", label: $at("Port Forwarding") },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`
                flex-1 min-w-[120px] px-6 py-3 text-sm font-medium transition-all duration-200 border-y border-r first:border-l first:rounded-l-lg last:rounded-r-lg flex items-center justify-center gap-2
                ${
                  activeTab === tab.id
                    ? "!bg-[rgba(22,152,217,1)] dark:!bg-[rgba(45,106,229,1))] !text-white border-[rgba(22,152,217,1)] dark:border-[rgba(45,106,229,1)]"
                    : "bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-[rgba(22,152,217,1)] dark:hover:border-[rgba(45,106,229,1)] hover:text-[rgba(22,152,217,1)] dark:hover:text-[rgba(45,106,229,1)]"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        {activeTab === "base" && (
          <AutoHeight>
            <GridCard>
              <div className="p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-[64px_1fr] gap-y-3 items-center">
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {$at("Input")}
                    </div>
                    <div className="flex justify-end">
                      <Select
                        className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                        value={baseDraft.inputPolicy}
                        onChange={v =>
                          setBaseDraft({
                            ...baseDraft,
                            inputPolicy: v as FirewallAction,
                          })
                        }
                        options={actionOptions}
                      />
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {$at("Output")}
                    </div>
                    <div className="flex justify-end">
                      <Select
                        className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                        value={baseDraft.outputPolicy}
                        onChange={v =>
                          setBaseDraft({
                            ...baseDraft,
                            outputPolicy: v as FirewallAction,
                          })
                        }
                        options={actionOptions}
                      />
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {$at("Forward")}
                    </div>
                    <div className="flex justify-end">
                      <Select
                        className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                        value={baseDraft.forwardPolicy}
                        onChange={v =>
                          setBaseDraft({
                            ...baseDraft,
                            forwardPolicy: v as FirewallAction,
                          })
                        }
                        options={actionOptions}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AntdButton onClick={fetchConfig} loading={loading}>
                      {$at("Refresh")}
                    </AntdButton>
                    <AntdButton
                      type="primary"
                      onClick={requestBaseSubmit}
                      loading={applying}
                      disabled={!hasBaseChanges}
                    >
                      {$at("Submit")}
                    </AntdButton>
                  </div>
                  </div>
              </div>
            </GridCard>
          </AutoHeight>
        )}

        {activeTab === "rules" && (
          <AutoHeight>
            <GridCard>
              <div className="p-4">
                <div className="space-y-4"> 
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AntdButton
                        type="primary"
                        onClick={openAddRule}
                      >
                        {$at("Add")}
                      </AntdButton>
                      <AntdButton danger onClick={deleteSelectedRules} disabled={!selectedRuleRows.size}>
                        {$at("Delete")}
                      </AntdButton>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                    <table className="min-w-max w-full text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                        <tr>
                          <th className="w-10 p-2 text-center font-medium" />
                          <th className="p-2 text-center font-medium">{$at("Chain")}</th>
                          <th className="p-2 text-center font-medium">{$at("Source")}</th>
                          <th className="p-2 text-center font-medium">{$at("Protocol")}</th>
                          <th className="p-2 text-center font-medium">{$at("Destination")}</th>
                          <th className="p-2 text-center font-medium">{$at("Action")}</th>
                          <th className="p-2 text-center font-medium">{$at("Description")}</th>
                          <th className="w-20 p-2 text-center font-medium">{$at("Operation")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appliedConfig.rules.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-500 dark:text-slate-400">
                              {$at("No rules available")}
                            </td>
                          </tr>
                        ) : (
                          appliedConfig.rules.map((r, idx) => (
                            <tr
                              key={idx}
                              className="border-t border-slate-200 dark:border-slate-700"
                            >
                              <td className="p-2 text-center">
                                <Checkbox
                                  checked={selectedRuleRows.has(idx)}
                                  onChange={e => {
                                    const next = new Set(selectedRuleRows);
                                    if (e.target.checked) next.add(idx);
                                    else next.delete(idx);
                                    setSelectedRuleRows(next);
                                  }}
                                />
                              </td>
                              <td className="p-2 text-center">{chainLabel(r.chain)}</td>
                              <td className="p-2 text-center">
                                {formatEndpoint(r.sourceIP, r.sourcePort, $at("Any"))}
                              </td>
                              <td className="p-2 text-center">{formatProtocols(r.protocols)}</td>
                              <td className="p-2 text-center">
                                {formatEndpoint(r.destinationIP, r.destinationPort, $at("Any"))}
                              </td>
                              <td className="p-2 text-center">{actionLabel(r.action)}</td>
                              <td className="p-2 text-center">{r.comment || "-"}</td>
                              <td className="p-2 text-center">
                                <AntdButton size="small" onClick={() => openEditRule(idx)}>
                                  {$at("Edit")}
                                </AntdButton>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </GridCard>
          </AutoHeight>
        )}

        {activeTab === "portForwards" && (
          <AutoHeight>
            <GridCard>
              <div className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AntdButton
                        type="primary"
                        onClick={openAddPortForward}
                      >
                        {$at("Add")}
                      </AntdButton>
                      <AntdButton
                        danger
                        onClick={deleteSelectedPortForwards}
                        disabled={!selectedPortForwardRows.size}
                      >
                        {$at("Delete")}
                      </AntdButton>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                    <table className="min-w-max w-full text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                        <tr>
                          <th className="w-10 p-2 text-center font-medium" />
                          <th className="p-2 text-center font-medium">{$at("Chain")}</th>
                          <th className="p-2 text-center font-medium">{$at("Source")}</th>
                          <th className="p-2 text-center font-medium">{$at("Protocol")}</th>
                          <th className="p-2 text-center font-medium">{$at("Destination")}</th>
                          <th className="p-2 text-center font-medium">{$at("Description")}</th>
                          <th className="w-20 p-2 text-center font-medium">{$at("Operation")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appliedConfig.portForwards.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-500 dark:text-slate-400">
                              {$at("No data available")}
                            </td>
                          </tr>
                        ) : (
                          appliedConfig.portForwards.map((r, idx) => (
                            <tr
                              key={idx}
                              className="border-t border-slate-200 dark:border-slate-700"
                            >
                              <td className="p-2 text-center">
                                <Checkbox
                                  checked={selectedPortForwardRows.has(idx)}
                                  disabled={r.managed === false}
                                  onChange={e => {
                                    const next = new Set(selectedPortForwardRows);
                                    if (e.target.checked) next.add(idx);
                                    else next.delete(idx);
                                    setSelectedPortForwardRows(next);
                                  }}
                                />
                              </td>
                              <td className="p-2 text-center">{portForwardChainLabel(r.chain)}</td>
                              <td className="p-2 text-center">
                                {formatEndpoint("", r.sourcePort, $at("Any"))}
                              </td>
                              <td className="p-2 text-center">{formatProtocols(r.protocols)}</td>
                              <td className="p-2 text-center">
                                {formatEndpoint(r.destinationIP, r.destinationPort, $at("Any"))}
                              </td>
                              <td className="p-2 text-center">{r.comment || "-"}</td>
                              <td className="p-2 text-center">
                                <AntdButton size="small" disabled={r.managed === false} onClick={() => openEditPortForward(idx)}>
                                  {$at("Edit")}
                                </AntdButton>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </GridCard>
          </AutoHeight>
        )}
      </div>

      <Modal
        open={ruleModalOpen}
        onCancel={() => setRuleModalOpen(false)}
        onOk={saveRuleDraft}
        confirmLoading={applying}
        title={$at(ruleEditingIndex === null ? "Add Rule" : "Edit Rule")}
        okText={$at("OK")}
        cancelText={$at("Cancel")}
        destroyOnClose
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm">{$at("Chain")}</div>
            <Select
              className="!w-full"
              value={ruleDraft.chain}
              onChange={v => setRuleDraft({ ...ruleDraft, chain: v as FirewallChain })}
              options={chainOptions}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Source IP")}</div>
            <Input
              value={ruleDraft.sourceIP}
              placeholder={$at("Any")}
              onChange={e => setRuleDraft({ ...ruleDraft, sourceIP: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Source Port")}</div>
            <Input
              value={ruleSourcePortText}
              placeholder={$at("Any")}
              onChange={e => setRuleSourcePortText(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Protocol")}</div>
            <div className="flex flex-wrap gap-3">
              {commProtocolOptions.map(p => (
                <Checkbox
                  key={p.key}
                  checked={ruleDraft.protocols.includes(p.key)}
                  onChange={e => {
                    const checked = e.target.checked;
                    const next = new Set(ruleDraft.protocols);
                    if (checked) next.add(p.key);
                    else next.delete(p.key);
                    const arr = [...next.values()];
                    setRuleDraft({ ...ruleDraft, protocols: normalizeRuleProtocols(arr) });
                  }}
                >
                  {p.label}
                </Checkbox>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Destination IP")}</div>
            <Input
              value={ruleDraft.destinationIP}
              placeholder={$at("Any")}
              onChange={e => setRuleDraft({ ...ruleDraft, destinationIP: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Destination Port")}</div>
            <Input
              value={ruleDestinationPortText}
              placeholder={$at("Any")}
              onChange={e => setRuleDestinationPortText(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Action")}</div>
            <Select
              className="!w-full"
              value={ruleDraft.action}
              onChange={v => setRuleDraft({ ...ruleDraft, action: v as FirewallAction })}
              options={actionOptions}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Description")}</div>
            <Input
              value={ruleDraft.comment}
              onChange={e => setRuleDraft({ ...ruleDraft, comment: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={pfModalOpen}
        onCancel={() => setPfModalOpen(false)}
        onOk={savePortForwardDraft}
        confirmLoading={applying}
        title={$at(pfEditingIndex === null ? "Add Rule" : "Edit Rule")}
        okText={$at("OK")}
        cancelText={$at("Cancel")}
        destroyOnClose
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm">
              <span className="text-red-500">*</span> {$at("Chain")}
            </div>
            <Select
              className="!w-full"
              value={pfDraft.chain ?? "prerouting"}
              onChange={v => {
                const c = v as "output" | "prerouting" | "prerouting_redirect";
                const curDst = pfDraft.destinationIP.trim();
                const forceLocal = c === "output" || c === "prerouting_redirect";
                setPfDraft({
                  ...pfDraft,
                  chain: c,
                  destinationIP: forceLocal
                    ? "0.0.0.0"
                    : curDst === "0.0.0.0" || curDst === "127.0.0.1"
                      ? ""
                      : pfDraft.destinationIP,
                });
              }}
              options={[
                { value: "prerouting", label: "PREROUTING" },
                { value: "prerouting_redirect", label: "PREROUTING_REDIRECT" },
                { value: "output", label: "OUTPUT" },
              ]}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">
              <span className="text-red-500">*</span> {$at("Source Port")}
            </div>
            <Input
              value={pfSourcePortText}
              onChange={e => setPfSourcePortText(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Protocol")}</div>
            <div className="flex flex-wrap gap-3">
              {portForwardProtocolOptions.map(p => (
                <Checkbox
                  key={p.key}
                  checked={pfDraft.protocols.includes(p.key)}
                  onChange={e => {
                    const checked = e.target.checked;
                    const next = new Set(pfDraft.protocols);
                    if (checked) next.add(p.key);
                    else next.delete(p.key);
                    setPfDraft({ ...pfDraft, protocols: [...next.values()] });
                  }}
                >
                  {p.label}
                </Checkbox>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm">
              <span className="text-red-500">*</span> {$at("Destination IP")}
            </div>
            <Input
              value={pfDraft.destinationIP}
              onChange={e => setPfDraft({ ...pfDraft, destinationIP: e.target.value })}
              disabled={(pfDraft.chain ?? "prerouting") !== "prerouting"}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">
              <span className="text-red-500">*</span> {$at("Destination Port")}
            </div>
            <Input
              value={pfDestinationPortText}
              onChange={e => setPfDestinationPortText(e.target.value)}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm">{$at("Description")}</div>
            <Input
              value={pfDraft.comment}
              onChange={e => setPfDraft({ ...pfDraft, comment: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showBaseSubmitConfirm}
        onClose={() => {
          setShowBaseSubmitConfirm(false);
        }}
        title={$at("Submit Firewall Policies?")}
        description={
          <>
            <p>
              {$at(
                "Warning: Adjusting some policies may cause network address loss, leading to device unavailability.",
              )}
            </p>
          </>
        }
        variant="warning"
        cancelText={$at("Cancel")}
        confirmText={$at("Submit")}
        onConfirm={handleBaseSubmit}
      />
    </div>
  );
}
