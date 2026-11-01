import React from "react";

import SideTabs from "@components/Sidebar/SideTabs";
import DevicePage from "@/layout/components_side/VirtualMediaSource/DevicePage";
import SDPage from "@/layout/components_side/VirtualMediaSource/SDPage";
import UnMountPage from "@/layout/components_side/VirtualMediaSource/UnMount";
import { useBootStorageType } from "@/hooks/useBootStorage";

const VirtualMediaSource: React.FC = () => {
  const { bootStorageType } = useBootStorageType();
  const isBootFromSD = bootStorageType === "sd";

  if (isBootFromSD) {
    return (
      <UnMountPage unmountedPage={<DevicePage />} />
    );
  }

  return (
    <UnMountPage unmountedPage={(
      <SideTabs
        tab1Label="KVM Storage"
        tab2Label="MicroSD Card"
        tab1Content={<DevicePage />}
        tab2Content={<SDPage/>}
        defaultActiveKey="1"
      />
    )}/>
  );
};

export default VirtualMediaSource;
