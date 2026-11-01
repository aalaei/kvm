import { useCallback, useEffect} from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftEndOnRectangleIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { Button, Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { LuMonitorSmartphone } from "react-icons/lu";
import { useReactAt } from 'i18n-auto-extractor/react'

import Container from "@components/Container";
import Card from "@components/Card";
import { useHidStore, useRTCStore, useUserStore, useVpnStore , useSettingsStore } from "@/hooks/stores";
import LogoLuckfox from "@/assets/logo-luckfox.png";
import USBStateStatus from "@components/Header/USBStateStatus";
import PeerConnectionStatusCard from "@components/Header/PeerConnectionStatusCard";
import VpnConnectionStatusCard from "@components/Header/VpnConnectionStatusCard";
import { DEVICE_API } from "@/ui.config";

import { SelectMenuBasic } from "../SelectMenuBasic";
import api from "../../api";
import { LinkButton } from "../Button";
import enJSON from '../../locales/en.json'
import zhJSON from '../../locales/zh.json'

interface NavbarProps {
  isLoggedIn: boolean;
  primaryLinks?: { title: string; to: string }[];
  userEmail?: string;
  showConnectionStatus?: boolean;
  picture?: string;
  kvmName?: string;
}

export default function DashboardNavbar({
  primaryLinks = [],
  isLoggedIn,
  showConnectionStatus,
  userEmail,
  picture,
  kvmName,
}: NavbarProps) {
  const peerConnectionState = useRTCStore(state => state.peerConnectionState);
  const tailScaleConnectionState = useVpnStore(state => state.tailScaleConnectionState);
  const zeroTierConnectionState  = useVpnStore(state => state.zeroTierConnectionState);
  const setUser = useUserStore(state => state.setUser);
  const navigate = useNavigate();
  const onLogout = useCallback(async () => {
    const logoutUrl = `${DEVICE_API}/auth/logout`;
    const res = await api.POST(logoutUrl);
    if (!res.ok) return;

    setUser(null);
    // The root route will redirect to appropriate login page, be it the local one or the cloud one
    navigate("/");
  }, [navigate, setUser]);

  const usbState = useHidStore(state => state.usbState);

  const language = useSettingsStore(state => state.language);
  const setLanguage = useSettingsStore(state => state.setLanguage);
  
  const LangOptions = [
    { value: "en", label: "English"},
    { value: "zh", label: "中文"},
  ];
  
  // default language
  const { setCurrentLang }= useReactAt();

  const handleLangChange = (lang: string) => {
      setLanguage(lang)
      setCurrentLang(lang, lang === 'en' ? enJSON : zhJSON)
  };

  useEffect(() => {
    setCurrentLang(language, language === 'en' ? enJSON : zhJSON)
  }, [language, setCurrentLang])

  // for testing
  //userEmail = "user@example.org";
  //picture = "https://placehold.co/32x32"

  return (
    <div className="w-full border-b border-b-slate-800/20 bg-white select-none dark:border-b-slate-300/20 dark:bg-slate-900">
      <Container>
        <div className="flex h-14 items-center justify-between">
          <div className="flex shrink-0 items-center gap-x-8">
            <div className="inline-block shrink-0">
              <div className="flex items-center gap-4">
                <a
                  href="https://wiki.luckfox.com/intro/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4"
                >
                  <img src={LogoLuckfox} alt="" className="h-[24px] dark:hidden" />
                  <img src={LogoLuckfox} alt="" className="hidden h-[24px] dark:block" />
                  <b className="navbar__title text--truncate dark:text-white">LUCKFOX</b>
                </a>
              </div>
            </div>

            <div className="flex gap-x-2">
              {primaryLinks.map(({ title, to }, i) => {
                return (
                  <LinkButton
                    key={i + title}
                    theme="blank"
                    size="SM"
                    text={title}
                    to={to}
                    LeadingIcon={LuMonitorSmartphone}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-x-2">
            <div className="flex shrink-0 items-center space-x-4">
              <div className="hidden items-stretch gap-x-2 md:flex">

                <div className="flex items-center gap-x-2"> 
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"  className="text-gray-700 dark:text-gray-300" >
                    <path fill="currentColor" 
                    d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" >
                    </path>
                  </svg>
                  <SelectMenuBasic
                    size="SM"
                    label=""
                    value={language}
                    onChange={(e) => handleLangChange(e.target.value)}
                    options={LangOptions}
                  />
                </div>

                {showConnectionStatus && (
                  <>
                    <div className="w-[159px]">
                      <PeerConnectionStatusCard
                        state={peerConnectionState}
                        title={kvmName}
                      />
                    </div>
                    <div className="hidden w-[159px] md:block">
                      <USBStateStatus
                        state={usbState}
                        peerConnectionState={peerConnectionState}
                      />
                    </div>
                    <div className="hidden w-[159px] md:block">
                      <VpnConnectionStatusCard
                        state={peerConnectionState === "connected" ? tailScaleConnectionState : "disconnected"}
                        title="TailScale"
                      />
                    </div>
                    <div className="hidden w-[159px] md:block">
                      <VpnConnectionStatusCard
                        state={peerConnectionState === "connected" ? zeroTierConnectionState : "disconnected"}
                        title="ZeroTier"
                      />
                    </div>
                  </>
                )}
                {isLoggedIn ? (
                  <>
                    <hr className="h-[20px] w-px self-center border-none bg-slate-800/20 dark:bg-slate-300/20" />
                    <div className="relative inline-block text-left">
                      <Menu>
                        <MenuButton className="h-full">
                          <Button className="flex h-full items-center gap-x-3 rounded-md border border-slate-800/20 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                            {picture ? (
                              <img
                                src={picture}
                                alt="Avatar"
                                className="size-6 rounded-full border-2 border-transparent transition-colors group-hover:border-blue-700"
                              />
                            ) : userEmail ? (
                              <span className="font-display max-w-[200px] truncate text-sm/6 font-semibold">
                                {userEmail}
                              </span>
                            ) : null}
                            <ChevronDownIcon className="size-4 shrink-0 text-slate-900 dark:text-white" />
                          </Button>
                        </MenuButton>
                        <MenuItems
                          transition
                          anchor="bottom end"
                          className="right-0 mt-1 w-56 origin-top-right p-px focus:outline-hidden data-closed:opacity-0"
                        >
                          <MenuItem>
                            <Card className="overflow-hidden">
                              {userEmail && (
                                <div className="space-y-1 p-1 dark:text-white">
                                  <div className="border-b border-b-slate-800/20 dark:border-slate-300/20">
                                    <div className="p-2">
                                      <div className="font-display text-xs">
                                        Logged in as
                                      </div>
                                      <div className="font-display max-w-[200px] truncate text-sm font-semibold">
                                        {userEmail}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div
                                className="space-y-1 p-1 dark:text-white"
                                onClick={onLogout}
                              >
                                <button className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700">
                                  <ArrowLeftEndOnRectangleIcon className="size-4" />
                                  <div className="font-display">Log out</div>
                                </button>
                              </div>
                            </Card>
                          </MenuItem>
                        </MenuItems>
                      </Menu>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
