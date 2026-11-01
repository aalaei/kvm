import { isMobile } from "react-device-detect";
import { LoaderFunctionArgs, redirect } from "react-router-dom";

import MobileHome, { LocalDevice } from "@/layout/index.mobile";
import api from "@/api";
import { DEVICE_API } from "@/ui.config";
import { DeviceStatus } from "@routes/login_page/index";
import PCHome from "@/layout/index.pc";

const deviceLoader = async () => {
  const res = await api
    .GET(`${DEVICE_API}/device/status`)
    .then(res => res.json() as Promise<DeviceStatus>);

  if (!res.isSetup) return redirect("/mode");

  const deviceRes = await api.GET(`${DEVICE_API}/device`);
  if (deviceRes.status === 401) return redirect("/login-local");
  if (deviceRes.ok) {
    const device = (await deviceRes.json()) as LocalDevice;
    return { authMode: device.authMode };
  }

  throw new Error("Error fetching device");
};

const loader = async (_args: LoaderFunctionArgs) => {
  return deviceLoader();
};
export default function Home() {

  if (isMobile) {
    return <MobileHome />;
  }
  return <PCHome />;
}
Home.loader = loader;
