import PowerControlUp from "@/layout/components_side/Power/PowerControlUp";
import { dark_bg2_style} from "@/layout/theme_color";

import WakeOnLan from "./WakeOnLan";

export default function PowerControl() {
  return (
    <div className={`space-y-4 h-full w-full ${dark_bg2_style}`}>
      <div className="grid h-full grid-rows-(--grid-headerBody)">
        <div className="space-y-4" onKeyUp={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <PowerControlUp />
          <WakeOnLan />
        </div>
      </div>
    </div>
  );
}
