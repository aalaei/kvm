import { isDesktop, isMobile } from "react-device-detect";
import { AnimatePresence } from "framer-motion";
import { useReactAt } from "i18n-auto-extractor/react";

import { useMacrosSideTitleState } from "@/hooks/stores";
import { cx } from "@/cva.config";
import StatsSidebar from "@/layout/components_side/Stats/StatsSidebar";
import ConnectionStatsSidebar from "@components/ConnectionStats";
import Clipboard from "@/layout/components_side/Clipboard/Clipboard";
import PowerControl from "@/layout/components_side/Power";
import SettingsVideoSide from "@/layout/components_side/Video/SettingsVideoSide";
import SettingsMacros from "@/layout/components_side/Macros";
import SharedFolders from "@/layout/components_side/SharedFolders";
import VirtualMediaSource from "@/layout/components_side/VirtualMediaSource";
import { HdmiSwitch, useHdmiSwitchConfigured } from "@components/extensions/HdmiSwitch";

interface SidebarContainerProps {
  readonly sidebarView: string | null;
}

export default  function SidebarContainer(props: SidebarContainerProps) {
  const { $at } = useReactAt();
  const { sidebarView } = props;
  const macrosSideTitle = useMacrosSideTitleState(state => state.sideTitle);
  const hdmiSwitchConfigured = useHdmiSwitchConfigured();

  // useConsoleLog()
  // { "border-x-transparent": !sidebarView },
  return (
    <div
      className={cx(
        "flex shrink-0 border-l border-l-slate-800/20 transition-all duration-500 ease-in-out dark:border-l-slate-300/20",
        { "border-x-transparent": !sidebarView },

      )}
      style={{ width: sidebarView ? isMobile ? "100%" : "493px" : 0 }}
    >

      <div className={`relative${isMobile ? "w-full" : " w-[493px]"} shrink-0`}>

        <AnimatePresence>
          <>
          {isDesktop&&
            <StatsSidebar title={$at("Connection Stats")} targetView={"connection-stats"} className={"p-[20px]"}>
            <ConnectionStatsSidebar />
          </StatsSidebar>}

          <StatsSidebar title={$at("Clipboard")} targetView={"Clipboard"}>
            <Clipboard />
          </StatsSidebar>
          
          {isDesktop&&<StatsSidebar title={$at("PowerControl")} floatOnMobile={true} targetView={"PowerControl"}>
            <PowerControl />
          </StatsSidebar>}
            {isDesktop&& <StatsSidebar title={$at("Video")} targetView={"SettingsVideo"} className={"p-[20px]"}>
            <SettingsVideoSide />
          </StatsSidebar>}
          {isDesktop&&
            <StatsSidebar title={macrosSideTitle} targetView={"Macros"} floatOnMobile={true} className={"top-[80px] pb-[60px] px-[20px] pt-[10px]"}>
            <SettingsMacros />
          </StatsSidebar>}
          <StatsSidebar title={$at("Shared Folders")} targetView={"SharedFolders"}>
            <SharedFolders />
          </StatsSidebar>
          {isDesktop&&<StatsSidebar title={$at("Virtual Media Source")} targetView={"VirtualMedia"}>
            <VirtualMediaSource />
          </StatsSidebar> }
          {isDesktop&&hdmiSwitchConfigured&&<StatsSidebar title={$at("HDMI Switch")} targetView={"HdmiSwitch"} className={"p-[20px]"}>
            <HdmiSwitch />
          </StatsSidebar>}
          </>
        </AnimatePresence>


       </div>
    </div>
  );
}