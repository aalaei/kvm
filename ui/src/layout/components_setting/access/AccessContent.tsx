import { useLoaderData } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Button as AntdButton, Select ,Checkbox} from "antd";
import {useReactAt} from 'i18n-auto-extractor/react'
import { isMobile } from "react-device-detect";

import api from "@/api";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { GridCard } from "@components/Card";
import { Button } from "@components/Button";
import { InputFieldWithLabel } from "@components/InputField";
import { SettingsSectionHeader } from "@components/Settings/SettingsSectionHeader";
import { useDeviceUiNavigation } from "@/hooks/useAppNavigation";
import notifications from "@/notifications";
import { DEVICE_API } from "@/ui.config";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { isOnDevice } from "@/main";
import { TextAreaWithLabel } from "@components/TextArea";
import { LocalDevice } from "@/layout/index.pc";
import { SettingsItem } from "@components/Settings/SettingsView";
import { useVpnStore, useLocalAuthModalStore } from "@/hooks/stores";
import { LogDialog } from "@components/LogDialog";
import { Dialog } from "@/layout/components_setting/access/auth";
import AutoHeight from "@components/AutoHeight";
import FirewallSettings from "./FirewallSettings";
import WebRtcServersSettings from "./WebRtcServers";

export interface TailScaleResponse {
  state: string;
  loginUrl: string;
  ip: string;
  xEdge: boolean;
}

export interface ZeroTierResponse {
  state: string;
  networkID: string;
  ip: string;
}

export interface FrpcResponse {
  running: boolean;
}

export interface EasyTierRunningResponse {
  running: boolean;
}

export interface EasyTierResponse {
  name: string;
  secret: string;
  node: string;
}

export interface VntRunningResponse {
  running: boolean;
}

export interface VntResponse {
  config_mode: string;
  token: string;
  device_id: string;
  name: string;
  server_addr: string;
  config_file: string;
  model?: string;
  password?: string;
}

export interface CloudflaredRunningResponse {
  running: boolean;
}

type ManagedVpnTool = "frpc" | "easytier" | "vnt" | "cloudflared";

export interface VpnToolSystemInfo {
  goos: string;
  goarch: string;
  uname_arch: string;
  arch_label: string;
  arch_keywords: string[];
}

export interface VpnToolStatus {
  tool: string;
  installed: boolean;
  source: string;
  current_version: string;
  detected_version: string;
  managed_versions: string[];
}

export interface VpnToolReleaseAsset {
  name: string;
  url: string;
  arch_match: boolean;
}

export interface VpnToolRelease {
  tag_name: string;
  assets: VpnToolReleaseAsset[];
}

export interface VpnToolInstallTask {
  tool: string;
  running: boolean;
  progress: number;
  message: string;
  logs: string[];
  error: string;
  version: string;
  updated_at: number;
}

export interface WireguardStatus {
  running: boolean;
}

export interface WireguardConfig {
  network_name: string;
  config_file: string;
}



export interface TLSState {
  mode: "self-signed" | "custom" | "disabled";
  certificate?: string;
  privateKey?: string;
}

const loader = async () => {
  if (isOnDevice) {
    const status = await api
      .GET(`${DEVICE_API}/device`)
      .then(res => res.json() as Promise<LocalDevice>);
    return status;
  }
  return null;
};

export default function SettingsAccessIndex() {
  const [openDialog, setOpenDialog] = useState(false);
  
  if (openDialog) {
    return <Dialog onClose={() => setOpenDialog(false)} />;
  }

  return <AccessContent setOpenDialog={setOpenDialog} />;
}

function AccessContent({ setOpenDialog }: { setOpenDialog: (open: boolean) => void }) {
  const { $at }= useReactAt();
  const loaderData = useLoaderData() as LocalDevice | null;
  const { setModalView } = useLocalAuthModalStore();
  const [send] = useJsonRpc();

  const [deviceId, setDeviceId] = useState<string | null>(null);

  const [tlsMode, setTlsMode] = useState<string>("disabled");
  const [tlsCert, setTlsCert] = useState<string>("");
  const [tlsKey, setTlsKey] = useState<string>("");

  const [activeTab, setActiveTab] = useState("tailscale");
    
  const tailScaleConnectionState = useVpnStore(state => state.tailScaleConnectionState);
  const tailScaleLoginUrl = useVpnStore(state => state.tailScaleLoginUrl);
  const tailScaleXEdge = useVpnStore(state => state.tailScaleXEdge)
  const tailScaleIP = useVpnStore(state => state.tailScaleIP);
  const setTailScaleConnectionState = useVpnStore(state => state.setTailScaleConnectionState);
  const setTailScaleLoginUrl = useVpnStore(state => state.setTailScaleLoginUrl); 
  const setTailScaleXEdge = useVpnStore(state => state.setTailScaleXEdge);
  const setTailScaleIP = useVpnStore(state => state.setTailScaleIP);
  
  const zeroTierConnectionState = useVpnStore(state => state.zeroTierConnectionState);
  const zeroTierNetworkID = useVpnStore(state => state.zeroTierNetworkID);
  const zeroTierIP = useVpnStore(state => state.zeroTierIP);
  const setZeroTierConnectionState = useVpnStore(state => state.setZeroTierConnectionState);
  const setZeroTierNetworkID = useVpnStore(state => state.setZeroTierNetworkID);
  const setZeroTierIP = useVpnStore(state => state.setZeroTierIP);

  const [tempNetworkID, setTempNetworkID] = useState("");
  const [isDisconnecting, setIsDisconnecting] = useState(false);
 
  const [frpcToml, setFrpcToml] = useState<string>("");
  const [frpcLog, setFrpcLog] = useState<string>("");
  const [showFrpcLogModal, setShowFrpcLogModal] = useState(false);
  const [frpcRunningStatus, setFrpcRunningStatus] = useState<FrpcResponse>({ running: false });
  
  const [tempEasyTierNetworkName, setTempEasyTierNetworkName] = useState("");
  const [tempEasyTierNetworkSecret, setTempEasyTierNetworkSecret] = useState("");
  const [tempEasyTierNetworkNodeMode, setTempEasyTierNetworkNodeMode] = useState("default");
  const [tempEasyTierNetworkNode, setTempEasyTierNetworkNode] = useState("tcp://public.easytier.cn:11010");
  const [easyTierRunningStatus, setEasyTierRunningStatus] = useState<EasyTierRunningResponse>({ running: false });
  const [showEasyTierLogModal, setShowEasyTierLogModal] = useState(false);
  const [showEasyTierNodeInfoModal, setShowEasyTierNodeInfoModal] = useState(false);
  const [easyTierLog, setEasyTierLog] = useState<string>("");
  const [easyTierNodeInfo, setEasyTierNodeInfo] = useState<string>("");
  const [easyTierConfig, setEasyTierConfig] = useState<EasyTierResponse>({
    name: "",
    secret: "",
    node: "",
  });
  
  const [wireguardConfigFileContent, setWireguardConfigFileContent] = useState<string>("");
  const [wireguardLog, setWireguardLog] = useState<string>("");
  const [showWireguardLogModal, setShowWireguardLogModal] = useState(false);
  const [wireguardInfo, setWireguardInfo] = useState<string>("");
  const [showWireguardInfoModal, setShowWireguardInfoModal] = useState(false);
  const [wireguardRunningStatus, setWireguardRunningStatus] = useState<WireguardStatus>({ running: false });

  const [vntConfigMode, setVntConfigMode] = useState("params"); // "params" or "file"
  const [tempVntToken, setTempVntToken] = useState("");
  const [tempVntDeviceId, setTempVntDeviceId] = useState("");
  const [tempVntName, setTempVntName] = useState("");
  const [tempVntServerAddr, setTempVntServerAddr] = useState("");
  const [vntConfigFileContent, setVntConfigFileContent] = useState("");
  const [vntRunningStatus, setVntRunningStatus] = useState<VntRunningResponse>({ running: false });
  const [showVntLogModal, setShowVntLogModal] = useState(false);
  const [showVntInfoModal, setShowVntInfoModal] = useState(false);
  const [vntLog, setVntLog] = useState<string>("");
  const [vntInfo, setVntInfo] = useState<string>("");
  const [vntConfig, setVntConfig] = useState<VntResponse>({
    config_mode: "params",
    token: "",
    device_id: "",
    name: "",
    server_addr: "",
    config_file: "",
    model: "",
    password: "",
  });
  const [tempVntModel, setTempVntModel] = useState("aes_gcm");
  const [tempVntPassword, setTempVntPassword] = useState("");

  // Cloudflare Tunnel
  const [cloudflaredRunningStatus, setCloudflaredRunningStatus] = useState<CloudflaredRunningResponse>({ running: false });
  const [cloudflaredToken, setCloudflaredToken] = useState("");
  const [cloudflaredLog, setCloudflaredLog] = useState<string>("");
  const [showCloudflaredLogModal, setShowCloudflaredLogModal] = useState(false);

  const [vpnToolSystemInfo, setVpnToolSystemInfo] = useState<VpnToolSystemInfo | null>(null);
  const [vpnToolStatusMap, setVpnToolStatusMap] = useState<Record<string, VpnToolStatus>>({});
  const [vpnToolReleasesMap, setVpnToolReleasesMap] = useState<Record<string, VpnToolRelease[]>>({});
  const [vpnToolSelectedVersionMap, setVpnToolSelectedVersionMap] = useState<Record<string, string>>({});
  const [vpnToolSelectedAssetMap, setVpnToolSelectedAssetMap] = useState<Record<string, string>>({});
  const [vpnToolBusyMap, setVpnToolBusyMap] = useState<Record<string, boolean>>({});
  const [vpnToolInstallTaskMap, setVpnToolInstallTaskMap] = useState<Record<string, VpnToolInstallTask>>({});
  const [vpnToolInstallPanelOpenMap, setVpnToolInstallPanelOpenMap] = useState<Record<string, boolean>>({
    frpc: false,
    easytier: false,
    vnt: false,
    cloudflared: false,
  });


  const getTLSState = useCallback(() => {
    send("getTLSState", {}, resp => {
      if ("error" in resp) return console.error(resp.error);
      const tlsState = resp.result as TLSState;

      setTlsMode(tlsState.mode);
      if (tlsState.certificate) setTlsCert(tlsState.certificate);
      if (tlsState.privateKey) setTlsKey(tlsState.privateKey);
    });
  }, [send]);

  // Function to update TLS state - accepts a mode parameter
  const updateTlsState = useCallback(
    (mode: string, cert?: string, key?: string) => {
      const state = { mode } as TLSState;
      if (cert && key) {
        state.certificate = cert;
        state.privateKey = key;
      }

      send("setTLSState", { state }, resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to update TLS settings: ${resp.error.data || "Unknown error"}`,
          );
          return;
        }

        notifications.success("TLS settings updated successfully");
      });
    },
    [send],
  );

  const getCloudflaredStatus = useCallback(() => {
    send("getCloudflaredStatus", {}, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to get Cloudflare status: ${resp.error.data || "Unknown error"}`);
        return;
      }
      setCloudflaredRunningStatus(resp.result as CloudflaredRunningResponse);
    });
  }, [send]);

  const handleStartCloudflared = useCallback(() => {
    if (!cloudflaredToken) {
      notifications.error("Please enter Cloudflare Tunnel Token");
      return;
    }
    send("startCloudflared", { token: cloudflaredToken }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to start Cloudflare: ${resp.error.data || "Unknown error"}`);
        setCloudflaredRunningStatus({ running: false });
        return;
      }
      notifications.success("Cloudflare started");
      setCloudflaredRunningStatus({ running: true });
    });
  }, [send, cloudflaredToken]);

  const handleStopCloudflared = useCallback(() => {
    send("stopCloudflared", {}, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to stop Cloudflare: ${resp.error.data || "Unknown error"}`);
        return;
      }
      notifications.success("Cloudflare stopped");
      setCloudflaredRunningStatus({ running: false });
    });
  }, [send]);

  const handleGetCloudflaredLog = useCallback(() => {
    send("getCloudflaredLog", {}, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to get Cloudflare log: ${resp.error.data || "Unknown error"}`);
        setCloudflaredLog("");
        return;
      }
      setCloudflaredLog(resp.result as string);
      setShowCloudflaredLogModal(true);
    });
  }, [send]);

  const managedTools: ManagedVpnTool[] = ["frpc", "easytier", "vnt", "cloudflared"];

  const getVpnToolSystemInfo = useCallback(() => {
    send("getVpnToolSystemInfo", {}, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to get system architecture info: ${resp.error.data || "Unknown error"}`);
        return;
      }
      setVpnToolSystemInfo(resp.result as VpnToolSystemInfo);
    });
  }, [send]);

  const getVpnToolStatus = useCallback((tool: ManagedVpnTool) => {
    send("getVpnToolStatus", { tool }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to get ${tool} status: ${resp.error.data || "Unknown error"}`);
        return;
      }
      setVpnToolStatusMap(prev => ({ ...prev, [tool]: resp.result as VpnToolStatus }));
    });
  }, [send]);

  const listVpnToolReleases = useCallback((tool: ManagedVpnTool) => {
    send("listVpnToolReleases", { tool }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to list ${tool} releases: ${resp.error.data || "Unknown error"}`);
        return;
      }
      const releases = resp.result as VpnToolRelease[];
      setVpnToolReleasesMap(prev => ({ ...prev, [tool]: releases }));
      if (!releases.length) {
        return;
      }
      setVpnToolSelectedVersionMap(prev => {
        if (prev[tool]) return prev;
        return { ...prev, [tool]: releases[0].tag_name };
      });
      setVpnToolSelectedAssetMap(prev => {
        if (prev[tool]) return prev;
        const firstRelease = releases[0];
        const preferred = firstRelease.assets.find(asset => asset.arch_match) || firstRelease.assets[0];
        return preferred ? { ...prev, [tool]: preferred.url } : prev;
      });
    });
  }, [send]);

  const refreshVpnToolManager = useCallback((tool: ManagedVpnTool, withReleases: boolean) => {
    getVpnToolStatus(tool);
    if (withReleases) {
      listVpnToolReleases(tool);
    }
  }, [getVpnToolStatus, listVpnToolReleases]);

  const getVpnToolInstallTask = useCallback((tool: ManagedVpnTool) => {
    send("getVpnToolInstallTask", { tool }, resp => {
      if ("error" in resp) {
        return;
      }
      setVpnToolInstallTaskMap(prev => ({ ...prev, [tool]: resp.result as VpnToolInstallTask }));
    });
  }, [send]);

  const handleVpnToolVersionChange = useCallback((tool: ManagedVpnTool, version: string) => {
    setVpnToolSelectedVersionMap(prev => ({ ...prev, [tool]: version }));
    const releases = vpnToolReleasesMap[tool] || [];
    const selectedRelease = releases.find(release => release.tag_name === version);
    if (!selectedRelease || !selectedRelease.assets.length) {
      setVpnToolSelectedAssetMap(prev => ({ ...prev, [tool]: "" }));
      return;
    }
    const preferred = selectedRelease.assets.find(asset => asset.arch_match) || selectedRelease.assets[0];
    setVpnToolSelectedAssetMap(prev => ({ ...prev, [tool]: preferred?.url || "" }));
  }, [vpnToolReleasesMap]);

  const handleInstallVpnTool = useCallback((tool: ManagedVpnTool) => {
    const version = vpnToolSelectedVersionMap[tool];
    const downloadURL = vpnToolSelectedAssetMap[tool];
    const releases = vpnToolReleasesMap[tool] || [];
    const release = releases.find(item => item.tag_name === version);
    const selectedAsset = release?.assets.find(asset => asset.url === downloadURL);
    if (!version || !downloadURL || !selectedAsset) {
      notifications.error(`Please select version and release asset for ${tool}`);
      return;
    }
    setVpnToolBusyMap(prev => ({ ...prev, [tool]: true }));
    send("startVpnToolInstall", { tool, version, assetName: selectedAsset.name, downloadURL }, resp => {
      setVpnToolBusyMap(prev => ({ ...prev, [tool]: false }));
      if ("error" in resp) {
        notifications.error(`Failed to install ${tool}: ${resp.error.data || "Unknown error"}`);
        return;
      }
      notifications.success(`${tool} install task started (${version})`);
      getVpnToolInstallTask(tool);
    });
  }, [send, vpnToolSelectedVersionMap, vpnToolSelectedAssetMap, vpnToolReleasesMap, getVpnToolInstallTask]);

  const handleUninstallVpnToolVersion = useCallback((tool: ManagedVpnTool, version: string) => {
    if (!version) {
      notifications.error("Please select installed version");
      return;
    }
    setVpnToolBusyMap(prev => ({ ...prev, [tool]: true }));
    send("uninstallVpnToolVersion", { tool, version }, resp => {
      setVpnToolBusyMap(prev => ({ ...prev, [tool]: false }));
      if ("error" in resp) {
        notifications.error(`Failed to uninstall ${tool} version ${version}: ${resp.error.data || "Unknown error"}`);
        return;
      }
      notifications.success(`${tool} ${version} uninstalled`);
      refreshVpnToolManager(tool, true);
    });
  }, [send, refreshVpnToolManager]);

  useEffect(() => {
    getCloudflaredStatus();
  }, [getCloudflaredStatus]);

  useEffect(() => {
    getVpnToolSystemInfo();
    managedTools.forEach(tool => {
      refreshVpnToolManager(tool, false);
      getVpnToolInstallTask(tool);
    });
  }, [getVpnToolSystemInfo, refreshVpnToolManager, getVpnToolInstallTask]);

  useEffect(() => {
    const timer = setInterval(() => {
      managedTools.forEach(tool => {
        getVpnToolInstallTask(tool);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [getVpnToolInstallTask]);

  useEffect(() => {
    const tabToolMap: Partial<Record<string, ManagedVpnTool>> = {
      frp: "frpc",
      easytier: "easytier",
      vnt: "vnt",
      cloudflared: "cloudflared",
    };
    const tool = tabToolMap[activeTab];
    if (tool) {
      refreshVpnToolManager(tool, false);
    }
    if (activeTab === "cloudflared") {
      getCloudflaredStatus();
    }
  }, [activeTab, refreshVpnToolManager, getCloudflaredStatus]);

  // Handle TLS mode change
  const handleTlsModeChange = (value: string) => {
    setTlsMode(value);

    // For "disabled" and "self-signed" modes, immediately apply the settings
    if (value !== "custom") {
      updateTlsState(value);
    }
  };

  const handleTlsCertChange = (value: string) => {
    setTlsCert(value);
  };

  const handleTlsKeyChange = (value: string) => {
    setTlsKey(value);
  };

  // Update the custom TLS settings button click handler
  const handleCustomTlsUpdate = () => {
    updateTlsState(tlsMode, tlsCert, tlsKey);
  };

  // Fetch device ID and cloud state on component mount
  useEffect(() => {
    getTLSState();

    send("getDeviceID", {}, async resp => {
      if ("error" in resp) return console.error(resp.error);
      setDeviceId(resp.result as string);
    });
  }, [send, getTLSState]);

  const handleTailScaleLogin = useCallback(() => {
    setTailScaleConnectionState("connecting");

    send("loginTailScale", { xEdge: tailScaleXEdge }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to login TailScale: ${resp.error.data || "Unknown error"}`,
        );
        setTailScaleConnectionState("closed");
        setTailScaleLoginUrl("");
        setTailScaleIP("");
        return;
      }
      const result = resp.result as TailScaleResponse;
      const validState = ["closed", "connecting", "connected", "disconnected" , "logined"].includes(result.state)
      ? result.state as "closed" | "connecting" | "connected" | "disconnected" | "logined"
      : "closed";
      setTailScaleConnectionState(validState);
      setTailScaleLoginUrl(result.loginUrl);
      setTailScaleIP(result.ip);
    });
  }, [send, tailScaleXEdge]);

  const handleTailScaleXEdgeChange = (enabled: boolean) => {
    setTailScaleXEdge(enabled);
  };

  const handleTailScaleLogout = useCallback(() => { 
    setIsDisconnecting(true);
    send("logoutTailScale", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to logout TailScale: ${resp.error.data || "Unknown error"}`,
        );  
        setIsDisconnecting(false);
        return;
      }
      setTailScaleConnectionState("disconnected"); 
      setTailScaleLoginUrl("");
      setTailScaleIP("");  
      setIsDisconnecting(false);
    });
  },[send]);

  const handleTailScaleCancel = useCallback(() => { 
    setIsDisconnecting(true);
    send("cancelTailScale", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to cancel TailScale: ${resp.error.data || "Unknown error"}`,
        );  
        setIsDisconnecting(false);
        return;
      }
      setTailScaleConnectionState("disconnected"); 
      setTailScaleLoginUrl("");
      setTailScaleIP("");  
      setIsDisconnecting(false);
    });
  },[send]);

  const handleZeroTierLogin = useCallback(() => {  
    setZeroTierConnectionState("connecting");
    const currentNetworkID = tempNetworkID;
    
    if (!/^[0-9a-f]{16}$/.test(currentNetworkID)) {
      notifications.error("Please enter a valid Network ID");
    setZeroTierConnectionState("disconnected");
      return;      
    }
    setZeroTierNetworkID(currentNetworkID);
    send("loginZeroTier", { networkID: currentNetworkID }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to login ZeroTier: ${resp.error.data || "Unknown error"}`,
        );

        setZeroTierConnectionState("closed"); 
        setZeroTierNetworkID("");
        setZeroTierIP("");
        return;
      }

      const result = resp.result as ZeroTierResponse;
      const validState = ["closed", "connecting", "connected", "disconnected" , "logined" ].includes(result.state)
      ? result.state as "closed" | "connecting" | "connected" | "disconnected" | "logined"
      : "closed";
      setZeroTierConnectionState(validState);
      setZeroTierIP(result.ip);
    });
  }, [send, tempNetworkID]);
  
  const handleZeroTierNetworkIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setTempNetworkID(value);
  }, []);

  const handleZeroTierLogout = useCallback(() => {  
    send("logoutZeroTier", { networkID: zeroTierNetworkID }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to logout ZeroTier: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setZeroTierConnectionState("disconnected");
      setZeroTierNetworkID("");
      setZeroTierIP("");
    });
  },[send, zeroTierNetworkID]);

  const handleStartFrpc = useCallback(() => {
    send("startFrpc", { frpcToml }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to start frpc: ${resp.error.data || "Unknown error"}`,
        );
        setFrpcRunningStatus({ running: false });
        return;
      }
      notifications.success("frpc started");
      setFrpcRunningStatus({ running: true });
    });
  }, [send, frpcToml]);
  
  const handleStopFrpc = useCallback(() => {
    send("stopFrpc", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to stop frpc: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("frpc stopped");
      setFrpcRunningStatus({ running: false });
    });
  }, [send]);

  const handleGetFrpcLog = useCallback(() => {
    send("getFrpcLog", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get frpc log: ${resp.error.data || "Unknown error"}`,
        );
        setFrpcLog("");
        return;
      }
      setFrpcLog(resp.result as string);
      setShowFrpcLogModal(true);
    });
  }, [send]);

  const getFrpcToml = useCallback(() => {
    send("getFrpcToml", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get frpc toml: ${resp.error.data || "Unknown error"}`,
        );
        setFrpcToml("");
        return;
      }
      setFrpcToml(resp.result as string);
    });
  }, [send]);
  
  const getFrpcStatus = useCallback(() => {
    send("getFrpcStatus", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get frpc status: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setFrpcRunningStatus(resp.result as FrpcResponse);
    });
  }, [send]);

  useEffect(() => {
    getFrpcStatus();
    getFrpcToml();
  }, [getFrpcStatus, getFrpcToml]);

  const handleStartEasyTier = useCallback(() => {
    if (!tempEasyTierNetworkName || !tempEasyTierNetworkSecret || !tempEasyTierNetworkNode) {
      notifications.error("Please enter EasyTier network name, secret and node");
      return;
    }
    setEasyTierConfig({
      name: tempEasyTierNetworkName,
      secret: tempEasyTierNetworkSecret,
      node: tempEasyTierNetworkNode,
    });
    send("startEasyTier", { name: tempEasyTierNetworkName, secret: tempEasyTierNetworkSecret, node: tempEasyTierNetworkNode }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to start EasyTier: ${resp.error.data || "Unknown error"}`,
        );
        setEasyTierRunningStatus({ running: false });
        return;
      }
      notifications.success("EasyTier started");
      setEasyTierRunningStatus({ running: true });
    });
  }, [send, tempEasyTierNetworkName, tempEasyTierNetworkSecret, tempEasyTierNetworkNode]);

  const handleStopEasyTier = useCallback(() => {
    send("stopEasyTier", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to stop EasyTier: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("EasyTier stopped");
      setEasyTierRunningStatus({ running: false });
    });
  }, [send]);

  const handleGetEasyTierLog = useCallback(() => {
    send("getEasyTierLog", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get EasyTier log: ${resp.error.data || "Unknown error"}`,
        );
        setEasyTierLog("");
        return;
      }
      setEasyTierLog(resp.result as string);
      setShowEasyTierLogModal(true);
    });
  }, [send]);
  
  const handleGetEasyTierNodeInfo = useCallback(() => {
    send("getEasyTierNodeInfo", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get EasyTier Node Info: ${resp.error.data || "Unknown error"}`,
        );
        setEasyTierNodeInfo("");
        return;
      }
      setEasyTierNodeInfo(resp.result as string);
      setShowEasyTierNodeInfoModal(true);
    });
  }, [send]);

  const getEasyTierConfig = useCallback(() => {
    send("getEasyTierConfig", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get EasyTier config: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      const result = resp.result as EasyTierResponse;
      setEasyTierConfig({
        name: result.name,
        secret: result.secret,
        node: result.node,
      });
    });
  }, [send]);
  
  const getEasyTierStatus = useCallback(() => {
    console.log("getEasyTierStatus")
    send("getEasyTierStatus", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get EasyTier status: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setEasyTierRunningStatus(resp.result as EasyTierRunningResponse);
    });
  }, [send]);

  const handleStartWireguard = useCallback(() => {
    if (!wireguardConfigFileContent) {
      notifications.error("Please enter WireGuard config content");
      return;
    }
    send("startWireguard", { configFile: wireguardConfigFileContent }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to start WireGuard: ${resp.error.data || "Unknown error"}`,
        );
        setWireguardRunningStatus({ running: false });
        return;
      }
      notifications.success("WireGuard started");
      setWireguardRunningStatus({ running: true });
    });
  }, [send, wireguardConfigFileContent]);

  const handleStopWireguard = useCallback(() => {
    send("stopWireguard", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to stop WireGuard: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("WireGuard stopped");
      setWireguardRunningStatus({ running: false });
    });
  }, [send]);

  const handleGetWireguardLog = useCallback(() => {
    send("getWireguardLog", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get WireGuard log: ${resp.error.data || "Unknown error"}`,
        );
        setWireguardLog("");
        return;
      }
      setWireguardLog(resp.result as string);
      setShowWireguardLogModal(true);
    });
  }, [send]);

  const handleGetWireguardInfo = useCallback(() => {
    send("getWireguardInfo", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get WireGuard info: ${resp.error.data || "Unknown error"}`,
        );
        setWireguardInfo("");
        return;
      }
      setWireguardInfo(resp.result as string);
      setShowWireguardInfoModal(true);
    });
  }, [send]);

  const getWireguardConfig = useCallback(() => {
    send("getWireguardConfig", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get WireGuard config: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      const result = resp.result as WireguardConfig;
      if (result.config_file) {
        setWireguardConfigFileContent(result.config_file);
      }
    });
  }, [send]);

  const getWireguardStatus = useCallback(() => {
    send("getWireguardStatus", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get WireGuard status: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setWireguardRunningStatus(resp.result as WireguardStatus);
    });
  }, [send]);
 
  useEffect(() => {
    getEasyTierConfig();
    getEasyTierStatus();
  }, [getEasyTierStatus, getEasyTierConfig]);

  useEffect(() => {
    getWireguardConfig();
    getWireguardStatus();
  }, [getWireguardStatus, getWireguardConfig]);
  
  useEffect(() => {
    if (tempEasyTierNetworkNodeMode === 'default') {
      setTempEasyTierNetworkNode('tcp://public.easytier.cn:11010');
    } else {
      setTempEasyTierNetworkNode('');
    }
  }, [tempEasyTierNetworkNodeMode]);

  const handleStartVnt = useCallback(() => {
    if (vntConfigMode === "file") {
      if (!vntConfigFileContent) {
        notifications.error("Please enter Vnt config file content");
        return;
      }
      setVntConfig({
        config_mode: "file",
        token: "",
        device_id: "",
        name: "",
        server_addr: "",
        config_file: vntConfigFileContent,
      });
      send("startVnt", { 
        config_mode: "file", 
        token: "", 
        device_id: "", 
        name: "", 
        server_addr: "", 
        config_file: vntConfigFileContent,
        model: tempVntModel,
        password: tempVntPassword,
      }, resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to start Vnt: ${resp.error.data || "Unknown error"}`,
          );
          setVntRunningStatus({ running: false });
          return;
        }
        notifications.success("Vnt started");
        setVntRunningStatus({ running: true });
      });
    } else {
      if (!tempVntToken) {
        notifications.error("Please enter Vnt token");
        return;
      }
      setVntConfig({
        config_mode: "params",
        token: tempVntToken,
        device_id: tempVntDeviceId,
        name: tempVntName,
        server_addr: tempVntServerAddr,
        config_file: "",
        model: tempVntModel,
        password: tempVntPassword,
      });
      send("startVnt", { 
        config_mode: "params", 
        token: tempVntToken, 
        device_id: tempVntDeviceId, 
        name: tempVntName, 
        server_addr: tempVntServerAddr, 
        config_file: "",
        model: tempVntModel,
        password: tempVntPassword,
      }, resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to start Vnt: ${resp.error.data || "Unknown error"}`,
          );
          setVntRunningStatus({ running: false });
          return;
        }
        notifications.success("Vnt started");
        setVntRunningStatus({ running: true });
      });
    }
  }, [send, vntConfigMode, tempVntToken, tempVntDeviceId, tempVntName, tempVntServerAddr, vntConfigFileContent, tempVntModel, tempVntPassword]);

  const handleStopVnt = useCallback(() => {
    send("stopVnt", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to stop Vnt: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("Vnt stopped");
      setVntRunningStatus({ running: false });
    });
  }, [send]);

  const handleGetVntLog = useCallback(() => {
    send("getVntLog", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get Vnt log: ${resp.error.data || "Unknown error"}`,
        );
        setVntLog("");
        return;
      }
      setVntLog(resp.result as string);
      setShowVntLogModal(true);
    });
  }, [send]);
  
  const handleGetVntInfo = useCallback(() => {
    send("getVntInfo", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get Vnt Info: ${resp.error.data || "Unknown error"}`,
        );
        setVntInfo("");
        return;
      }
      setVntInfo(resp.result as string);
      setShowVntInfoModal(true);
    });
  }, [send]);

  const getVntConfig = useCallback(() => {
    send("getVntConfig", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get Vnt config: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      const result = resp.result as VntResponse;
      setVntConfig({
        config_mode: result.config_mode || "params",
        token: result.token,
        device_id: result.device_id,
        name: result.name,
        server_addr: result.server_addr,
        config_file: result.config_file,
        model: result.model || "",
        password: result.password || "",
      });
      setVntConfigMode(result.config_mode || "params");
      if (result.config_file) {
        setVntConfigFileContent(result.config_file);
      }
      if (result.model) setTempVntModel(result.model);
      if (result.password) setTempVntPassword(result.password);
    });
  }, [send]);

  const getVntConfigFile = useCallback(() => {
    send("getVntConfigFile", {}, resp => {
      if ("error" in resp) {
        return;
      }
      const result = resp.result as string;
      if (result) {
        setVntConfigFileContent(result);
      }
    });
  }, [send]);
  
  const getVntStatus = useCallback(() => {
    send("getVntStatus", {}, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to get Vnt status: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setVntRunningStatus(resp.result as VntRunningResponse);
    });
  }, [send]);
 
  useEffect(() => {
    getVntConfig();
    getVntStatus();
    getVntConfigFile();
  }, [getVntStatus, getVntConfig]);

  const renderVpnToolManager = (tool: ManagedVpnTool, label: string) => {
    const status = vpnToolStatusMap[tool];
    const releases = vpnToolReleasesMap[tool] || [];
    const selectedVersion = vpnToolSelectedVersionMap[tool] || "";
    const selectedRelease = releases.find(release => release.tag_name === selectedVersion);
    const selectedAsset = vpnToolSelectedAssetMap[tool] || "";
    const assets = selectedRelease?.assets || [];
    const busy = vpnToolBusyMap[tool] || false;
    const installTask = vpnToolInstallTaskMap[tool];
    const installRunning = installTask?.running === true;
    const installPanelOpen = vpnToolInstallPanelOpenMap[tool] || false;
    const isInstalled = status?.installed === true;
    const uninstallVersion = status?.current_version || status?.managed_versions?.[0] || "";

    return (
      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {label} {$at("Version Manager")}
            </span>
            <div className="flex items-center gap-x-2">
              <Button
                size="SM"
                theme="light"
                text={$at("Refresh")}
                onClick={() => refreshVpnToolManager(tool, installPanelOpen)}
                disabled={busy || installRunning}
              />
              <Button
                size="SM"
                theme="light"
                text={installPanelOpen ? $at("Hide Install Actions") : $at("Show Install Actions")}
                onClick={() => {
                  const nextOpen = !installPanelOpen;
                  setVpnToolInstallPanelOpenMap(prev => ({ ...prev, [tool]: nextOpen }));
                  if (nextOpen) {
                    listVpnToolReleases(tool);
                  }
                }}
                disabled={busy || installRunning}
              />
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            {$at("Install Status")}: {status?.installed ? $at("Installed") : $at("Not Installed")}
            {status?.source ? ` (${status.source})` : ""}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            {$at("Detected Version")}: {status?.detected_version || "-"}
          </div>

          {installPanelOpen ? (
            <>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {$at("System Architecture")}: {vpnToolSystemInfo?.arch_label || "unknown"}
                {vpnToolSystemInfo?.arch_keywords?.length
                  ? ` (${vpnToolSystemInfo.arch_keywords.join(", ")})`
                  : ""}
              </div>
              <div className="space-y-2">
                <SettingsItem title={$at("Release Version")} description="">
                  <Select
                    className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                    value={selectedVersion}
                    onChange={value => handleVpnToolVersionChange(tool, value)}
                    options={releases.map(release => ({
                      value: release.tag_name,
                      label: release.tag_name,
                    }))}
                  />
                </SettingsItem>
                <SettingsItem title={$at("Release Asset")} description="">
                  <Select
                    className={isMobile ? "!w-full !h-[36px]" : "!w-[60%] !h-[36px]"}
                    value={selectedAsset}
                    onChange={value => setVpnToolSelectedAssetMap(prev => ({ ...prev, [tool]: value }))}
                    options={assets.map(asset => ({
                      value: asset.url,
                      label: `${asset.arch_match ? "[ARCH OK] " : ""}${asset.name}`,
                    }))}
                  />
                </SettingsItem>
              </div>
              <div className="flex items-center gap-x-2">
                {isInstalled ? (
                  <>
                    <Button
                      size="SM"
                      theme="primary"
                      text={$at("Update")}
                      onClick={() => handleInstallVpnTool(tool)}
                      disabled={busy || installRunning || !selectedVersion || !selectedAsset}
                    />
                    <Button
                      size="SM"
                      theme="danger"
                      text={$at("Uninstall")}
                      onClick={() => handleUninstallVpnToolVersion(tool, uninstallVersion)}
                      disabled={busy || installRunning || !uninstallVersion}
                    />
                  </>
                ) : (
                  <Button
                    size="SM"
                    theme="primary"
                    text={$at("Install")}
                    onClick={() => handleInstallVpnTool(tool)}
                    disabled={busy || installRunning || !selectedVersion || !selectedAsset}
                  />
                )}
              </div>
              {installRunning && installTask ? (
                <div className="space-y-2 rounded border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {$at("Install Task")}: {installTask.message || "-"}
                    {installTask.error ? ` (${installTask.error})` : ""}
                  </div>
                  <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded bg-blue-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, Math.round((installTask.progress || 0) * 100)))}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {$at("Progress")}: {Math.max(0, Math.min(100, Math.round((installTask.progress || 0) * 100)))}%
                  </div>
                  {!!installTask.logs?.length && (
                    <pre className="max-h-36 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      {installTask.logs.join("\n")}
                    </pre>
                  )}
                </div>
              ) : null}
              {status?.managed_versions?.length ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {$at("Installed Versions")}: {status.managed_versions.join(", ")}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={$at("Access")}
        description={$at("Manage the Access Control of the device")}
      />

      {loaderData?.authMode && (
        <>
          <div className="space-y-4">
            <SettingsSectionHeader
              title={$at("Local")}
              description={$at("Manage the mode of local access to the device")}
            />
            <>
              <SettingsItem
                title={$at("HTTPS Mode")}
                description={$at("Configure secure HTTPS access to your device")}
              >
                <Select
                  className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                  value={tlsMode===""?"disabled":tlsMode}
                  onChange={e => handleTlsModeChange(e)}
                  options={[
                    { value: "disabled", label: "Disabled" },
                    { value: "self-signed", label: "Self-signed" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </SettingsItem>

              {tlsMode === "custom" && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-4">
                    <SettingsItem
                      title={$at("TLS Certificate")}
                      description={$at("Paste your TLS certificate below. For certificate chains, include the entire chain (leaf, intermediate, and root certificates).")}
                    />
                    <div className="space-y-4">
                      <TextAreaWithLabel
                        label={$at("Certificate")}
                        rows={3}
                        placeholder={
                          $at("-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----")
                        }
                        value={tlsCert}
                        onChange={e => handleTlsCertChange(e.target.value)}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-4">
                        <TextAreaWithLabel
                          label={$at("Private Key")}
                          description={$at("For security reasons, it will not be displayed after saving.")}
                          rows={3}
                          placeholder={
                            $at("-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----")
                          }
                          value={tlsKey}
                          onChange={e => handleTlsKeyChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-x-2">
                    <Button
                      size="SM"
                      theme="primary"
                      text={$at("Update TLS Settings")}
                      onClick={handleCustomTlsUpdate}
                    />
                  </div>
                </div>
              )}

              <SettingsItem
                title={$at("Authentication Mode")}
                description={`${$at("Current mode:")} ${loaderData.authMode === "password" ? $at("Password protected") : $at("No password")}`}
              >
                {loaderData.authMode === "password" ? (
                  <AntdButton
                    type="primary"
                    onClick={() => {
                      setModalView("deletePassword");
                      setOpenDialog(true);
                    }}
                    className={isMobile ? "w-full" : ""}
                  >{$at("Disable Protection")}</AntdButton>
                ) : (
                  <AntdButton
                    type="primary"
                    onClick={() => {
                      setModalView("createPassword");
                      setOpenDialog(true);  
                    }}
                    className={isMobile ? "w-full" : ""}
                  >{$at("Enable Password")}</AntdButton>
                )}
              </SettingsItem>
            </>

            {loaderData.authMode === "password" && (
              <SettingsItem
                title={$at("Change Password")}
                description={$at("Update your device access password")}
              >
                <AntdButton
                  type="primary"
                  onClick={() => {
                    setModalView("updatePassword");
                    setOpenDialog(true);
                  }}
                  className={isMobile ? "w-full" : ""}
                  >
                    {$at("Change Password")}
                  </AntdButton>
              </SettingsItem>
            )}

            <FirewallSettings />

          </div>
          <div className="h-px w-full bg-slate-800/10 dark:bg-slate-300/20" />
        </>
      )}

      <div className="space-y-4">
        <SettingsSectionHeader
          title={$at("WebRTC Servers")}
          description={$at("STUN and TURN servers used for peer connections")}
        />
        <GridCard>
          <AutoHeight>
            <div className="space-y-4 p-4">
              <WebRtcServersSettings />
            </div>
          </AutoHeight>
        </GridCard>
      </div>

      <div className="space-y-4">
        <SettingsSectionHeader
          title={$at("Remote")}
          description={$at("Manage the mode of Remote access to the device")}
        />

        {/* Tabs style from /home/cro/kvm_ui_251209/ui/src/second/components_setting/AccessContent/ */}
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max">
            {[
              { id: "tailscale", label: "TailScale" },
              { id: "zerotier", label: "ZeroTier" },
              { id: "wireguard", label: "WireGuard" },
              { id: "easytier", label: "EasyTier" },
              { id: "vnt", label: "Vnt" },
              { id: "cloudflared", label: "CloudFlare" },
              { id: "frp", label: "Frp" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
          {activeTab === "tailscale" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {/* Experimental Badge */}
                        <div>
                          <span className="inline-flex items-center rounded border border-red-500 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            Experimental
                          </span>
                        </div>

                        {/* TailScale use xEdge server - checkbox on the right */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {$at("TailScale use xEdge server")}
                          </span>
                          <Checkbox 
                            disabled={tailScaleConnectionState !== "disconnected"}
                            checked={tailScaleXEdge}
                            onChange={e => {
                              if (tailScaleConnectionState !== "disconnected") {
                                notifications.error("TailScale is running and this setting cannot be modified");
                                return;
                              }
                              handleTailScaleXEdgeChange(e.target.checked);
                            }}
                          />
                        </div>

                        {tailScaleConnectionState === "connecting" && (
                          <div className="flex items-center justify-between gap-x-2">
                            <p>Connecting...</p>
                            <Button
                              size="SM"
                              theme="light"
                              text={$at("Cancel")}
                              onClick={handleTailScaleCancel}
                            /> 
                          </div>
                        )}

                        {tailScaleConnectionState === "connected" && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-x-2 justify-between">
                              {tailScaleLoginUrl && (
                                <p>{$at("Login URL:")} <a href={tailScaleLoginUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400">LoginUrl</a></p> 
                              )}
                              {!tailScaleLoginUrl && (
                                <p>{$at("Wait to obtain the Login URL")}</p> 
                              )} 
                              <Button
                                size="SM"
                                theme="danger"
                                text={isDisconnecting ? $at("Quitting...") : $at("Quit")}
                                onClick={handleTailScaleLogout}
                                disabled={isDisconnecting === true}
                              />
                            </div>
                          </div>
                        )}

                        {tailScaleConnectionState === "logined" && (
                          <div className="space-y-4">
                            {/* IP and Quit button on the same line */}
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                IP: {tailScaleIP}
                              </span>
                              <Button
                                size="SM"
                                theme="danger"
                                text={isDisconnecting ? $at("Quitting...") : $at("Quit")}
                                onClick={handleTailScaleLogout}
                                disabled={isDisconnecting === true}
                              />
                            </div>
                          </div>
                        )}

                        {tailScaleConnectionState === "closed" && (
                          <div className="text-sm text-red-600 dark:text-red-400">
                            <p>Connect fail, please retry</p>
                          </div>    
                        )}

                        {((tailScaleConnectionState === "disconnected") || (tailScaleConnectionState === "closed")) && (
                          <Button
                            size="SM"
                            theme="primary"
                            text={$at("Enable")}
                            onClick={handleTailScaleLogin}
                          />
                        )}
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "zerotier" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {/* Experimental Badge */}
                        <div>
                          <span className="inline-flex items-center rounded border border-red-500 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            Experimental
                          </span>
                        </div>

                        {zeroTierConnectionState === "connecting" && (
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            <p>{$at("Connecting...")}</p>
                          </div>
                        )}

                        {zeroTierConnectionState === "connected" && (
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network ID")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {zeroTierNetworkID}
                              </span>
                            </div>
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Quit")}
                                onClick={handleZeroTierLogout}
                              />
                            </div>
                          </div>
                        )}

                        {zeroTierConnectionState === "logined" && (
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network ID")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {zeroTierNetworkID}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network IP")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {zeroTierIP}
                              </span>
                            </div> 
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Quit")}
                                onClick={handleZeroTierLogout}
                              />
                            </div>                
                          </div>
                        )}

                        {zeroTierConnectionState === "closed" && (
                          <div className="flex items-center gap-x-2 justify-between">
                            <p>{$at("Connect fail, please retry")}</p>
                            <Button
                              size="SM"
                              theme="light"
                              text={$at("Retry")}
                              onClick={handleZeroTierLogout}
                            /> 
                          </div>
                        )}

                        {(zeroTierConnectionState === "disconnected") && (
                          <div className="flex items-end gap-x-2">
                            <InputFieldWithLabel
                              size="SM"
                              label={$at("Network ID")}
                              value={tempNetworkID}
                              onChange={handleZeroTierNetworkIdChange}
                              placeholder={$at("Enter ZeroTier Network ID")}
                            />
                            <Button
                              size="SM"
                              theme="primary"
                              text={$at("Join in")}
                              onClick={handleZeroTierLogin}
                            />
                          </div> 
                        )}
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "wireguard" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        <TextAreaWithLabel
                          label={$at("Edit wg0.conf")}
                          placeholder={$at("Enter WireGuard configuration")}
                          value={wireguardConfigFileContent || ""}
                          rows={5}
                          readOnly={wireguardRunningStatus.running}
                          onChange={e => setWireguardConfigFileContent(e.target.value)}
                        />
                        <div className="flex items-center gap-x-2">
                          {wireguardRunningStatus.running ? (
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Stop")}
                                onClick={handleStopWireguard}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Log")}
                                onClick={handleGetWireguardLog}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Status")}
                                onClick={handleGetWireguardInfo}
                              />
                            </div>
                          ) : (
                            <Button
                              size="SM"
                              theme="primary"
                              text={$at("Start")}
                              onClick={handleStartWireguard}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "easytier" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {renderVpnToolManager("easytier", "EasyTier")}
                        { easyTierRunningStatus.running ? (  
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network Node")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {easyTierConfig.node || tempEasyTierNetworkNode}
                              </span>
                            </div>
                            <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network Name")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {easyTierConfig.name || tempEasyTierNetworkName}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Network Secret")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {easyTierConfig.secret || tempEasyTierNetworkSecret}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Stop")}
                                onClick={handleStopEasyTier}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Log")}
                                onClick={handleGetEasyTierLog}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Node Info")}
                                onClick={handleGetEasyTierNodeInfo}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4"> 
                            <div className="space-y-4">
                              <SettingsItem
                                title={$at("Network Node")}
                                description=""
                              >
                                <Select
                                  className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"} 
                                  value={tempEasyTierNetworkNodeMode}
                                  onChange={e => setTempEasyTierNetworkNodeMode(e)}
                                  options={[
                                    { value: "default", label: $at("Default") },
                                    { value: "custom", label: $at("Custom") },
                                  ]}
                                />
                              </SettingsItem>
                            </div> 
                            {tempEasyTierNetworkNodeMode === "custom" && (
                              <div className="flex items-end gap-x-2">
                                <InputFieldWithLabel
                                  size="SM"
                                  label={$at("Network Node")}
                                  value={tempEasyTierNetworkNode}
                                  onChange={e => setTempEasyTierNetworkNode(e.target.value)}
                                  placeholder={$at("Enter EasyTier Network Node")}
                                />
                              </div>
                            )}
                            <div className="flex items-end gap-x-2">
                              <InputFieldWithLabel
                                size="SM"
                                label={$at("Network Name")}
                                value={tempEasyTierNetworkName}
                                onChange={e => setTempEasyTierNetworkName(e.target.value)}
                                placeholder={$at("Enter EasyTier Network Name")}
                              />
                            </div> 
                            <div className="flex items-end gap-x-2">
                              <InputFieldWithLabel
                                size="SM"
                                label={$at("Network Secret")}
                                value={tempEasyTierNetworkSecret}
                                onChange={e => setTempEasyTierNetworkSecret(e.target.value)}
                                placeholder={$at("Enter EasyTier Network Secret")}
                              />
                            </div> 

                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="primary"
                                text={$at("Start")}
                                onClick={handleStartEasyTier}
                              />
                            </div>
                          </div>
                        )} 
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "vnt" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {renderVpnToolManager("vnt", "Vnt")}
                        { vntRunningStatus.running ? (  
  
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {$at("Config Mode")}
                              </span>
                              <span className="text-right text-sm font-medium">
                                {vntConfig.config_mode === "file" ? $at("Config File") : $at("Parameters")}
                              </span>
                            </div>
                            
                            {vntConfig.config_mode === "file" ? (
                              <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                                <span className="text-sm text-slate-600 dark:text-slate-400">
                                  {$at("Config")}
                                </span>
                                <span className="text-right text-sm font-medium">
                                  {$at("Using config file")}
                                </span>
                              </div>
                            ) : (
                              <>
                                <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                                  <span className="text-sm text-slate-600 dark:text-slate-400">
                                    {$at("Token")}
                                  </span>
                                  <span className="text-right text-sm font-medium">
                                    {vntConfig.token || tempVntToken}
                                  </span>
                                </div>
                                {(vntConfig.device_id || tempVntDeviceId) && (
                                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">
                                      {$at("Device ID")}
                                    </span>
                                    <span className="text-right text-sm font-medium">
                                      {vntConfig.device_id || tempVntDeviceId}
                                    </span>
                                  </div>
                                )}
                                {(vntConfig.name || tempVntName) && (
                                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">
                                      {$at("Name")}
                                    </span>
                                    <span className="text-right text-sm font-medium">
                                      {vntConfig.name || tempVntName}
                                    </span>
                                  </div>
                                )}
                                {(vntConfig.server_addr || tempVntServerAddr) && (
                                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">
                                      {$at("Server Address")}
                                    </span>
                                    <span className="text-right text-sm font-medium">
                                      {vntConfig.server_addr || tempVntServerAddr}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                            
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Stop")}
                                onClick={handleStopVnt}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Log")}
                                onClick={handleGetVntLog}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Info")}
                                onClick={handleGetVntInfo}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Config Mode Selector */}
                            <div className="space-y-4">
                              <SettingsItem
                                title={$at("Config Mode")}
                                description=""
                              >
                                <Select
                                  className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}  
                                  value={vntConfigMode}
                                  onChange={e => setVntConfigMode(e)}
                                  options={[
                                    { value: "params", label: $at("Parameters") },
                                    { value: "file", label: $at("Config File") },
                                  ]}
                                />
                              </SettingsItem>
                            </div>
                            
                            {vntConfigMode === "file" ? (
                              // Config File Mode
                              <div className="space-y-4">
                                <TextAreaWithLabel
                                  label={$at("Edit vnt.ini")}
                                  placeholder={$at("Enter vnt-cli configuration")}
                                  value={vntConfigFileContent || ""}
                                  rows={5}
                                  onChange={e => setVntConfigFileContent(e.target.value)}
                                />
                              </div>
                            ) : (
                              // Parameters Mode
                              <div className="space-y-4">
                                <div className="flex items-end gap-x-2">
                                  <InputFieldWithLabel
                                    size="SM"
                                    label={$at("Token (Required)")}
                                    value={tempVntToken}
                                    onChange={e => setTempVntToken(e.target.value)}
                                    placeholder={$at("Enter Vnt Token")}
                                  />
                                </div> 
                                <div className="flex items-end gap-x-2">
                                  <InputFieldWithLabel
                                    size="SM"
                                    label={$at("Device ID (Optional)")}
                                    value={tempVntDeviceId}
                                    onChange={e => setTempVntDeviceId(e.target.value)}
                                    placeholder={$at("Enter Device ID")}
                                  />
                                </div>
                                <div className="flex items-end gap-x-2">
                                  <InputFieldWithLabel
                                    size="SM"
                                    label={$at("Name (Optional)")}
                                    value={tempVntName}
                                    onChange={e => setTempVntName(e.target.value)}
                                    placeholder={$at("Enter Device Name")}
                                  />
                                </div>
                                <div className="flex items-end gap-x-2">
                                  <InputFieldWithLabel
                                    size="SM"
                                    label={$at("Server Address (Optional)")}
                                    value={tempVntServerAddr}
                                    onChange={e => setTempVntServerAddr(e.target.value)}
                                    placeholder={$at("Enter Server Address")}
                                  />
                                </div>
                                
                                <div className="space-y-4">
                                  <SettingsItem
                                    title={$at("Encryption Algorithm")}
                                    description=""
                                  >
                                    <Select
                                      className={isMobile ? "!w-full !h-[36px]" : "!w-[28%] !h-[36px]"}
                                      value={tempVntModel}
                                      onChange={e => setTempVntModel(e)}
                                      options={[
                                        { value: "aes_gcm", label: "aes_gcm" },
                                        { value: "chacha20_poly1305", label: "chacha20_poly1305" },
                                        { value: "chacha20", label: "chacha20" },
                                        { value: "aes_cbc", label: "aes_cbc" },
                                        { value: "aes_ecb", label: "aes_ecb" },
                                        { value: "sm4_cbc", label: "sm4_cbc" },
                                        { value: "xor", label: "xor" },
                                      ]}
                                    />
                                  </SettingsItem>
                                </div>
                                
                                <div className="flex items-end gap-x-2">
                                  <InputFieldWithLabel
                                    size="SM"
                                    type="password"
                                    label={$at("Password(Optional)")}
                                    value={tempVntPassword}
                                    onChange={e => setTempVntPassword(e.target.value)}
                                    placeholder={$at("Enter Vnt Password")}
                                  />
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="primary"
                                text={$at("Start")}
                                onClick={handleStartVnt}
                              />
                            </div>
                          </div>
                        )} 
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "cloudflared" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {renderVpnToolManager("cloudflared", "Cloudflare")}
                        {cloudflaredRunningStatus.running ? (
                          <div className="flex items-center gap-x-2">
                            <Button
                              size="SM"
                              theme="danger"
                              text={$at("Stop")}
                              onClick={handleStopCloudflared}
                            />
                            <Button
                              size="SM"
                              theme="light"
                              text={$at("Log")}
                              onClick={handleGetCloudflaredLog}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-end gap-x-2">
                              <InputFieldWithLabel
                                size="SM"
                                type="text"
                                label={$at("Cloudflare Tunnel Token")}
                                value={cloudflaredToken}
                                onChange={e => setCloudflaredToken(e.target.value)}
                                placeholder={$at("Enter Cloudflare Tunnel Token")}
                              />
                          </div>
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="primary"
                                text={$at("Start")}
                                onClick={handleStartCloudflared}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}

          {activeTab === "frp" && (
                <AutoHeight>
                  <GridCard>
                    <div className="p-4">
                      <div className="space-y-4">
                        {renderVpnToolManager("frpc", "frpc")}
                        <TextAreaWithLabel
                          label={$at("Edit frpc.toml")}
                          placeholder={$at("Enter frpc configuration")}
                          value={frpcToml || ""}
                          rows={3}
                          readOnly={frpcRunningStatus.running}
                          onChange={e => setFrpcToml(e.target.value)}
                        />
                        <div className="flex items-center gap-x-2">
                          {frpcRunningStatus.running ? (
                            <div className="flex items-center gap-x-2">
                              <Button
                                size="SM"
                                theme="danger"
                                text={$at("Stop")}
                                onClick={handleStopFrpc}
                              />
                              <Button
                                size="SM"
                                theme="light"
                                text={$at("Log")}
                                onClick={handleGetFrpcLog}
                              />
                            </div>
                          ) : (
                            <Button
                              size="SM"
                              theme="primary"
                              text={$at("Start")}
                              onClick={handleStartFrpc}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </GridCard>
                </AutoHeight>
          )}
      </div>

      <LogDialog
        open={showCloudflaredLogModal}
        onClose={() => {
          setShowCloudflaredLogModal(false);
        }}
        title="Cloudflare Log"
        description={cloudflaredLog}
      />

      <LogDialog
        open={showEasyTierLogModal}
        onClose={() => {
          setShowEasyTierLogModal(false);
        }}
        title="EasyTier Log"
        description={easyTierLog}
      />
      
      <LogDialog
        open={showEasyTierNodeInfoModal}
        onClose={() => {
          setShowEasyTierNodeInfoModal(false);
        }}
        title="EasyTier Node Info"
        description={easyTierNodeInfo}
      />
        
      <LogDialog
        open={showWireguardLogModal}
        onClose={() => {
          setShowWireguardLogModal(false);
        }}
        title="WireGuard Log"
        description={wireguardLog}
      />

      <LogDialog
        open={showWireguardInfoModal}
        onClose={() => {
          setShowWireguardInfoModal(false);
        }}
        title="WireGuard Status"
        description={wireguardInfo}
      />

      <LogDialog
        open={showFrpcLogModal}
        onClose={() => {
          setShowFrpcLogModal(false);
        }}
        title="Frpc Log"
        description={frpcLog}
      />

      <LogDialog
        open={showVntLogModal}
        onClose={() => {
          setShowVntLogModal(false);
        }}
        title="Vnt Log"
        description={vntLog}
      />
      
      <LogDialog
        open={showVntInfoModal}
        onClose={() => {
          setShowVntInfoModal(false);
        }}
        title="Vnt Info"
        description={vntInfo}
      />

    </div>
    </div>
  );
}

SettingsAccessIndex.loader = loader;
