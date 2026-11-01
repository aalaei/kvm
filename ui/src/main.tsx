import ReactDOM from "react-dom/client";
import "./index.css";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  redirect,
  RouterProvider,
  useRouteError,
} from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/16/solid";

import EmptyCard from "@components/EmptyCard";
import NotFoundPage from "@components/NotFoundPage";
import { LocalDevice } from "@/layout/index.pc";
import Card from "@components/Card";
import LocalAuthPage, { DeviceStatus } from "@routes/login_page/index";
import { ThemeProvider } from "@/layout/contexts/ThemeContext";
import PassWordPage from "@routes/password";
import Home from "@/layout";
import OtherSessionRoute from "@/layout/core/other-session";
import LoginLocalRoute from "@routes/login-local";

import api from "./api";
import { DEVICE_API } from "./ui.config";
import Notifications from "./notifications";

export const isOnDevice = true;
export const isInCloud = !isOnDevice;

export async function checkDeviceAuth() {
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
}

export async function checkAuth() {
  return checkDeviceAuth();
}

  const router = createBrowserRouter([
    {
      path: "/login-local",
      element: <LoginLocalRoute />,
      action: LoginLocalRoute.action,
      loader: LoginLocalRoute.loader,
    },
    {
      path: "/mode",
      element: <LocalAuthPage />,
      action: LocalAuthPage.action,
    },
    {
      path: "/mode/password",
      element: <PassWordPage />,
      action: PassWordPage.action,
    },
    {
      path: "/",
      errorElement: <ErrorBoundary />,
      element: <Home />,
      loader: Home.loader,
      children: [
        {
          path: "other-session",
          element: <OtherSessionRoute />,
        },
      ]
    },
  ]);

document.addEventListener("DOMContentLoaded", () => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <>

      <ThemeProvider>
        <RouterProvider router={router} />
        <Notifications
          toastOptions={{
            className:
              "rounded-sm border-none bg-white text-black shadow-sm outline-1 outline-slate-800/30",
          }}
          max={2}
        />


      </ThemeProvider>
    </>,
  );
});

function ErrorBoundary() {
  const error = useRouteError();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const errorMessage = error?.data?.error?.message || error?.message;
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return <NotFoundPage />;
  }

  return (
    <div className="h-full w-full">
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-2xl">
          <EmptyCard
            IconElm={ExclamationTriangleIcon}
            iconClassName="text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]"
            headline="Oh no!"
            description="Something went wrong. Please try again later or contact support"
            BtnElm={
              errorMessage && (
                <Card>
                  <div className="flex items-center font-mono">
                    <div className="flex p-2 text-black dark:text-white">
                      <span className="text-sm">{errorMessage}</span>
                    </div>
                  </div>
                </Card>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
