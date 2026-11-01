import { isMobile } from "react-device-detect";

import BottomBarPC from "./BottomBarPC";
import BottomBarMobile from "./BottomBarMobile";

export default function BottomBar() {
  if (isMobile) {
    return <BottomBarMobile />;
  }

  return <BottomBarPC />;
}