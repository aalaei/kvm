import { isMobile } from 'react-device-detect';

import MobileTopBar from "@/layout/core/bar_top/TopBarMobile";
import TopBarPC from "@/layout/core/bar_top/TopBarPC";

export default function Index({
                                 requestFullscreen,

                               }: {
  requestFullscreen: () => Promise<void>;

}) {
  if(isMobile){
    return <MobileTopBar requestFullscreen={requestFullscreen} />;
  }

  return (
    <TopBarPC requestFullscreen={requestFullscreen} />
  );
}
