import { Button } from "antd";
import {useReactAt} from 'i18n-auto-extractor/react'
import { isMobile } from "react-device-detect";

import { GridCard } from "@components/Card";
import { LifeTimeLabel } from "@/layout/components_setting/network/NetworkContent";
import { NetworkState } from "@/hooks/stores";

export default function DhcpLeaseCard({
  networkState,
  setShowRenewLeaseConfirm,
}: {
  networkState: NetworkState;
  setShowRenewLeaseConfirm: (show: boolean) => void;
}) {
  const { $at }= useReactAt();
  return (
    <GridCard>
      <div className="animate-fadeIn p-4 opacity-0 animation-duration-500 text-black dark:text-white">
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {$at("DHCP Lease Information")}
          </h3>
          {isMobile ?
            <div className="flex gap-x-6 gap-y-2">
              <div className="flex-1 space-y-2">
                {networkState?.dhcp_lease?.ip && (
                  <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("IP Address")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.ip}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.netmask && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Subnet Mask")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.netmask}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.dns && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("DNS Servers")}
                  </span>
                    <span className="text-right text-sm font-medium">
                    {networkState?.dhcp_lease?.dns.map(dns => <div key={dns}>{dns}</div>)}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.broadcast && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Broadcast Address")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.broadcast}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.domain && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Domain")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.domain}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.ntp_servers &&
                  networkState?.dhcp_lease?.ntp_servers.length > 0 && (
                    <div
                      className="flex justify-between gap-x-8 border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                      <div className="w-full grow text-sm text-slate-600 dark:text-[#ffffff]">
                        {$at("NTP Servers")}
                      </div>
                      <div className="shrink text-right text-sm font-medium">
                        {networkState?.dhcp_lease?.ntp_servers.map(server => (
                          <div key={server}>{server}</div>
                        ))}
                      </div>
                    </div>
                  )}

                {networkState?.dhcp_lease?.hostname && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Hostname")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.hostname}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.routers &&
                  networkState?.dhcp_lease?.routers.length > 0 && (
                    <div className="flex justify-between pt-2">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                      {$at("Gateways")}
                    </span>
                      <span className="text-right text-sm font-medium">
                      {networkState?.dhcp_lease?.routers.map(router => (
                        <div key={router}>{router}</div>
                      ))}
                    </span>
                    </div>
                  )}

                {networkState?.dhcp_lease?.server_id && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("DHCP Server")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.server_id}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.lease_expiry && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Lease Expiry")}
                  </span>
                    <span className="text-sm font-medium">
                    <LifeTimeLabel
                      lifetime={`${networkState?.dhcp_lease?.lease_expiry}`}
                    />
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.mtu && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">MTU</span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.mtu}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.ttl && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">TTL</span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.ttl}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_next_server && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot Next Server")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_next_server}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_server_name && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot Server Name")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_server_name}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_file && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot File")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_file}
                  </span>
                  </div>
                )}
              </div>
            </div>
            :
            <div className="flex gap-x-6 gap-y-2">
              <div className="flex-1 space-y-2">
                {networkState?.dhcp_lease?.ip && (
                  <div className="flex justify-between border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("IP Address")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.ip}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.netmask && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Subnet Mask")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.netmask}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.dns && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("DNS Servers")}
                  </span>
                    <span className="text-right text-sm font-medium">
                    {networkState?.dhcp_lease?.dns.map(dns => <div key={dns}>{dns}</div>)}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.broadcast && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Broadcast Address")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.broadcast}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.domain && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Domain")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.domain}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.ntp_servers &&
                  networkState?.dhcp_lease?.ntp_servers.length > 0 && (
                    <div
                      className="flex justify-between gap-x-8 border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                      <div className="w-full grow text-sm text-slate-600 dark:text-[#ffffff]">
                        {$at("NTP Servers")}
                      </div>
                      <div className="shrink text-right text-sm font-medium">
                        {networkState?.dhcp_lease?.ntp_servers.map(server => (
                          <div key={server}>{server}</div>
                        ))}
                      </div>
                    </div>
                  )}

                {networkState?.dhcp_lease?.hostname && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Hostname")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.hostname}
                  </span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                {networkState?.dhcp_lease?.routers &&
                  networkState?.dhcp_lease?.routers.length > 0 && (
                    <div className="flex justify-between pt-2">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                      {$at("Gateways")}
                    </span>
                      <span className="text-right text-sm font-medium">
                      {networkState?.dhcp_lease?.routers.map(router => (
                        <div key={router}>{router}</div>
                      ))}
                    </span>
                    </div>
                  )}

                {networkState?.dhcp_lease?.server_id && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("DHCP Server")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.server_id}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.lease_expiry && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Lease Expiry")}
                  </span>
                    <span className="text-sm font-medium">
                    <LifeTimeLabel
                      lifetime={`${networkState?.dhcp_lease?.lease_expiry}`}
                    />
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.mtu && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">MTU</span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.mtu}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.ttl && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                    <span className="text-sm text-slate-600 dark:text-[#ffffff]">TTL</span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.ttl}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_next_server && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot Next Server")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_next_server}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_server_name && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot Server Name")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_server_name}
                  </span>
                  </div>
                )}

                {networkState?.dhcp_lease?.bootp_file && (
                  <div className="flex justify-between border-t border-slate-800/10 pt-2 dark:border-slate-300/20">
                  <span className="text-sm text-slate-600 dark:text-[#ffffff]">
                    {$at("Boot File")}
                  </span>
                    <span className="text-sm font-medium">
                    {networkState?.dhcp_lease?.bootp_file}
                  </span>
                  </div>
                )}
              </div>
            </div>
          }


          <div>
            <Button
              className={"!h-[36px] !text-[rgba(20,204,45,1)] !border-[rgba(20,204,45,1)]"}

              onClick={() => setShowRenewLeaseConfirm(true)}>
              {$at("Renew DHCP Lease")}
            </Button>
          </div>
        </div>
      </div>
    </GridCard>
  );
}
