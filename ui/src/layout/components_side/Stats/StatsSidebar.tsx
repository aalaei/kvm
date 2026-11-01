import { useReactAt } from "i18n-auto-extractor/react";
import { useInterval } from "usehooks-ts";
import { motion } from "framer-motion";
import { isMobile } from "react-device-detect";

import StatsSidebarHeader from "@components/StatsSidebarHeader";
import { useRTCStore, useUiStore } from "@/hooks/stores";
import { dark_bg2_style, dark_bg_style_fun } from "@/layout/theme_color";
import { useTheme } from "@/layout/contexts/ThemeContext";

interface StatsSidebarProps {
  title: string;
  targetView: string;
  className?:string;
  children: React.ReactNode;
  floatOnMobile?: boolean;
}

const StatsSidebar = ({
                        title,
                        targetView,
                        children,
                        className='p-[20px]',
                        floatOnMobile = false
                      }: StatsSidebarProps) => {
  const setSidebarView = useUiStore(state => state.setSidebarView);
  const appendInboundRtpStats = useRTCStore(state => state.appendInboundRtpStats);
  const appendIceCandidatePair = useRTCStore(state => state.appendCandidatePairStats);
  const appendDiskDataChannelStats = useRTCStore(state => state.appendDiskDataChannelStats);
  const appendLocalCandidateStats = useRTCStore(state => state.appendLocalCandidateStats);
  const appendRemoteCandidateStats = useRTCStore(state => state.appendRemoteCandidateStats);
  const peerConnection = useRTCStore(state => state.peerConnection);
  const mediaStream = useRTCStore(state => state.mediaStream);
  const sidebarView = useUiStore(state => state.sidebarView);

  useInterval(function collectWebRTCStats() {
    (async () => {
      if (!mediaStream) return;
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (!videoTrack) return;
      const stats = await peerConnection?.getStats();
      let successfulLocalCandidateId: string | null = null;
      let successfulRemoteCandidateId: string | null = null;

      stats?.forEach(report => {
        if (report.type === "inbound-rtp") {
          appendInboundRtpStats(report);
        } else if (report.type === "candidate-pair" && report.nominated) {
          if (report.state === "succeeded") {
            successfulLocalCandidateId = report.localCandidateId;
            successfulRemoteCandidateId = report.remoteCandidateId;
          }
          appendIceCandidatePair(report);
        } else if (report.type === "local-candidate") {
          if (successfulLocalCandidateId === report.id) {
            appendLocalCandidateStats(report);
          }
        } else if (report.type === "remote-candidate") {
          if (successfulRemoteCandidateId === report.id) {
            appendRemoteCandidateStats(report);
          }
        } else if (report.type === "data-channel" && report.label === "disk") {
          appendDiskDataChannelStats(report);
        }
      });
    })();
  }, 500);
  const { isDark } = useTheme();
  return sidebarView === targetView ? (
    <motion.div
      className={`absolute inset-0 ${dark_bg_style_fun(isDark)}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.5,
        ease: "easeInOut",
      }}
    >
      {isMobile ? (
        floatOnMobile ? (
          <div
            className={`flex flex-col shadow-xs bg-white   fixed top-[40px] left-0 w-screen z-[100] h-[calc(100%-40px)] ${dark_bg_style_fun(isDark)} ${className}`}
          >
            {children}
          </div>
        ) : (
          <div className={` h-full ${dark_bg2_style}`}>
            <div className={className}>       <StatsSidebarHeader title={title} setSidebarView={setSidebarView} /></div>

            <div
              className={`${className} h-full space-y-4 overflow-y-auto bg-white py-2  ${dark_bg2_style}`}>

              <div className={` pb-5  ${dark_bg2_style}`}>
                {children}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className={`grid h-full grid-rows-(--grid-headerBody) shadow-xs px-[15px] py-[30px] ${dark_bg2_style}`}>
          <StatsSidebarHeader title={title} setSidebarView={setSidebarView} />
          <div className="h-full space-y-4 overflow-y-auto  px-4 py-2 pb-8">
            <div className="space-y-4">
              {children}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  ) : null;
};

export default StatsSidebar;