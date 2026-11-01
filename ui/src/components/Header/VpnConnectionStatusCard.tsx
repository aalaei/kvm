import StatusCard from "@components/Header/StatusCards";
import TailscaleIcon from "@/assets/tailscale.png";
import ZeroTierIcon from "@/assets/zerotier.png";

const VpnConnectionStatusMap = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  closed: "Closed",
  logined: "Logined",
};

export type VpnConnections = keyof typeof VpnConnectionStatusMap;

type StatusProps = Record<VpnConnections, {
    statusIndicatorClassName: string;
  }>;

export default function VpnConnectionStatusCard({
  state,
  title,
}: {
  state?: VpnConnections;
  title?: string;
}) {
  if (!state) return null;
  const StatusCardProps: StatusProps = {
    logined: {
      statusIndicatorClassName: "bg-green-500 border-green-600",
    },
    connected: {
      statusIndicatorClassName: "bg-green-500 border-green-600",
    },
    connecting: {
      statusIndicatorClassName: "bg-slate-300 border-slate-400",
    },
    disconnected: {
      statusIndicatorClassName: "bg-slate-300 border-slate-400",
    },
    closed: {
      statusIndicatorClassName: "bg-slate-300 border-slate-400",
    },  
  };
  const props = StatusCardProps[state];
  if (!props) return;

  return (
    <StatusCard
      title={title || "Vpn Network"}
      status={VpnConnectionStatusMap[state]}
      {...StatusCardProps[state]}
    />
  );
}
