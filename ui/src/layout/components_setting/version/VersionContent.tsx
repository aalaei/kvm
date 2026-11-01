
import { useCallback, useEffect, useRef, useState } from "react";
import { Button as AntdButton, Checkbox, Select } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { isMobile } from "react-device-detect";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import { useBootStorageType } from "@/hooks/useBootStorage";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { SettingsItem } from "@components/Settings/SettingsView";
import Card from "@components/Card";
import LoadingSpinner from "@components/LoadingSpinner";
import { Button } from "@components/Button";
import { InputFieldWithLabel } from "@components/InputField";
import { UpdateState, useDeviceStore, useUpdateStore } from "@/hooks/stores";
import notifications from "@/notifications";
import { formatters } from "@/utils";

export interface SystemVersionInfo {
  local: { appVersion: string; systemVersion: string };
  remote?: { appVersion: string; systemVersion: string };
  systemUpdateAvailable: boolean;
  appUpdateAvailable: boolean;
  appSignatureMissing?: boolean;
  systemSignatureMissing?: boolean;
  appSignatureAbsent?: boolean;
  systemSignatureAbsent?: boolean;
  appSignatureInvalid?: boolean;
  systemSignatureInvalid?: boolean;
  appNoPublicKey?: boolean;
  systemNoPublicKey?: boolean;
  signatureVerified?: boolean;
  error?: string;
}

export interface LocalVersionInfo {
  appVersion: string;
  systemVersion: string;
}

export default function SettingsVersion() {
  const [send] = useJsonRpc();
  const [autoUpdate, setAutoUpdate] = useState(true);
  const { $at } = useReactAt();
  const { setModalView, otaState } = useUpdateStore();
  const { bootStorageType } = useBootStorageType();
  const isBootFromSD = bootStorageType === "sd";
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [signatureStatusLoading, setSignatureStatusLoading] = useState(true);
  const [signatureStatus, setSignatureStatus] = useState<{
    appSignatureAbsent: boolean;
    appSignatureInvalid: boolean;
    appNoPublicKey: boolean;
    signatureVerified: boolean;
  } | null>(null);
  const updatePanelRef = useRef<HTMLDivElement | null>(null);
  const [updateSource, setUpdateSource] = useState("github");
  const [customUpdateBaseURL, setCustomUpdateBaseURL] = useState("");
  const [updateDownloadProxy, setUpdateDownloadProxy] = useState("");

  const currentVersions = useDeviceStore(state => {
    const { appVersion, systemVersion } = state;
    if (!appVersion || !systemVersion) return null;
    return { appVersion, systemVersion };
  });

  useEffect(() => {
    send("getAutoUpdateState", {}, resp => {
      if ("error" in resp) return;
      setAutoUpdate(resp.result as boolean);
    });
  }, [send]);

  useEffect(() => {
    send("getCustomUpdateBaseURL", {}, resp => {
      if ("error" in resp) return;
      setCustomUpdateBaseURL(resp.result as string);
    });
  }, [send]);

  useEffect(() => {
    send("getUpdateDownloadProxy", {}, resp => {
      if ("error" in resp) return;
      setUpdateDownloadProxy(resp.result as string);
    });
  }, [send]);

  const handleAutoUpdateChange = (enabled: boolean) => {
    send("setAutoUpdateState", { enabled }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to set auto-update: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      setAutoUpdate(enabled);
    });
  };

  useEffect(() => {
    setSignatureStatusLoading(true);
    send("getSelfSignatureStatus", {}, resp => {
      setSignatureStatusLoading(false);
      if ("error" in resp) return;
      const sigStatus = resp.result as {
        appSignatureAbsent: boolean;
        appSignatureInvalid: boolean;
        appNoPublicKey: boolean;
      };
      const hasSigFiles = !sigStatus.appSignatureAbsent;
      const noPublicKey = sigStatus.appNoPublicKey;
      const signatureVerified = hasSigFiles && !noPublicKey && !sigStatus.appSignatureInvalid;
      setSignatureStatus({ ...sigStatus, signatureVerified });
    });
  }, [send]);

  const applyUpdateSource = useCallback(
    (source: string) => {
      send("setUpdateSource", { source }, resp => {
        if ("error" in resp) {
          notifications.error(`Failed to set update source: ${resp.error.data || "Unknown error"}`);
          return;
        }
        notifications.success(
          `Update source set to ${updateSourceOptions.find(x => x.value === source)?.label}`,
        );
        setUpdateSource(source);
      });
    },
    [send],
  );

  const applyCustomUpdateBaseURL = useCallback(() => {
    send("setCustomUpdateBaseURL", { baseURL: customUpdateBaseURL }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to save custom base URL: ${resp.error.data || "Unknown error"}`);
        return;
      }
      notifications.success("Custom base URL applied");
    });
  }, [customUpdateBaseURL, send]);

  const applyUpdateDownloadProxy = useCallback(() => {
    send("setUpdateDownloadProxy", { proxy: updateDownloadProxy }, resp => {
      if ("error" in resp) {
        notifications.error(
          `Failed to save update download proxy: ${resp.error.data || "Unknown error"}`,
        );
        return;
      }
      notifications.success("Update download proxy applied");
    });
  }, [send, updateDownloadProxy]);

  const closeUpdateDialog = useCallback(() => {
    setIsUpdateDialogOpen(false);
  }, []);

  const openUpdatePanel = useCallback(() => {
    setIsUpdateDialogOpen(true);
    setModalView("loading");
    setTimeout(() => updatePanelRef.current?.scrollIntoView({ block: "nearest" }), 0);
  }, [setModalView]);

  const checkForUpdates = useCallback(() => {
    if (updateSource === "custom") {
      send("setCustomUpdateBaseURL", { baseURL: customUpdateBaseURL }, resp => {
        if ("error" in resp) {
          notifications.error(
            `Failed to set custom base URL: ${resp.error.data || "Unknown error"}`,
          );
          return;
        }
        send("setUpdateSource", { source: updateSource }, resp2 => {
          if ("error" in resp2) {
            notifications.error(
              `Failed to set update source: ${resp2.error.data || "Unknown error"}`,
            );
            return;
          }
          openUpdatePanel();
        });
      });
      return;
    }

    send("setUpdateSource", { source: updateSource }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to set update source: ${resp.error.data || "Unknown error"}`);
        return;
      }
      openUpdatePanel();
    });
  }, [customUpdateBaseURL, openUpdatePanel, send, updateSource]);

  const onConfirmUpdate = useCallback(() => {
    send("tryUpdate", {});
    setModalView("updating");
  }, [send, setModalView]);

  useEffect(() => {
    if (!isUpdateDialogOpen) return;
    if (otaState.updating) {
      setModalView("updating");
    } else if (otaState.error) {
      setModalView("error");
    } else {
      setModalView("loading");
    }
  }, [isUpdateDialogOpen, otaState.updating, otaState.error, setModalView]);

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={$at("Version")}
        description={$at("Check the versions of the system and applications")}
      />

      <div className="space-y-4">
        <div className="space-y-4 pb-2">
          <SettingsItem
            title={""}
            description={
              currentVersions ? (
                <>
                  {$at("AppVersion")}: {currentVersions.appVersion}
                  <br />
                  {$at("SystemVersion")}: {currentVersions.systemVersion}
                </>
              ) : (
                <>
                  {$at("AppVersion: Loading...")}
                  <br />
                  {$at("SystemVersion: Loading...")}
                </>
              )
            }
          />

          <SignatureStatusCard
            signatureStatus={signatureStatus}
            signatureStatusLoading={signatureStatusLoading}
          />

          {!isBootFromSD && (
            <>
              <UpdateSourceSettings
                updateSource={updateSource}
                onUpdateSourceChange={applyUpdateSource}
                customUpdateBaseURL={customUpdateBaseURL}
                onCustomUpdateBaseURLChange={setCustomUpdateBaseURL}
                onSaveCustomUpdateBaseURL={applyCustomUpdateBaseURL}
              />

              <div className="flex items-center justify-start">
                <AntdButton type="primary" onClick={checkForUpdates} className={isMobile ? "w-full" : ""}>
                  {$at("Check for Updates")}
                </AntdButton>
              </div>
            </>
          )}

          <div className="hidden">
            <SettingsItem
              title={$at("Auto Update")}
              description={$at("Automatically update the device to the latest version")}
            >
              <Checkbox
                checked={autoUpdate}
                onChange={e => {
                  handleAutoUpdateChange(e.target.checked);
                }}
              />
            </SettingsItem>
          </div>

          {isUpdateDialogOpen && (
            <div ref={updatePanelRef} className="pt-2">
              <UpdateContent
                onClose={closeUpdateDialog}
                onConfirmUpdate={onConfirmUpdate}
                updateSource={updateSource}
                updateDownloadProxy={updateDownloadProxy}
                onUpdateDownloadProxyChange={setUpdateDownloadProxy}
                onSaveUpdateDownloadProxy={applyUpdateDownloadProxy}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const updateSourceOptions = [
  //{ value: "cdn", label: "CDN" },
  { value: "github", label: "github" },
  //{ value: "gitee", label: "gitee" },
  { value: "custom", label: "custom" },
];

function UpdateSourceSettings({
  updateSource,
  onUpdateSourceChange,
  customUpdateBaseURL,
  onCustomUpdateBaseURLChange,
  onSaveCustomUpdateBaseURL,
}: {
  updateSource: string;
  onUpdateSourceChange: (source: string) => void;
  customUpdateBaseURL: string;
  onCustomUpdateBaseURLChange: (baseURL: string) => void;
  onSaveCustomUpdateBaseURL: () => void;
}) {
  const { $at } = useReactAt();
  return (
    <div className="space-y-4">
      <SettingsItem
        title={$at("Update Source")}
        description={$at("Select the update source")}
      >
        <Select
          value={updateSource}
          className={`${isMobile?"w-full":"h-[36px] w-[22%]"}`}
          options={updateSourceOptions.map(opt => ({
            ...opt,
            label: $at(opt.label),
          }))}
          onChange={e => onUpdateSourceChange(e)}
        />
      </SettingsItem>
      {updateSource === "custom" && (
        <div className="flex items-end gap-x-2">
          <InputFieldWithLabel
            size="SM"
            label="Custom Base URL"
            value={customUpdateBaseURL}
            onChange={e => onCustomUpdateBaseURLChange(e.target.value)}
            placeholder="temp_url:picokvm.top/luckfox_picokvm_firmware/lastest/"
          />
          <AntdButton type="primary" onClick={onSaveCustomUpdateBaseURL}>
            {$at("Apply")}
          </AntdButton>
        </div>
      )}
    </div>
  );
}

function UpdateContent({
  onClose,
  onConfirmUpdate,
  updateSource,
  updateDownloadProxy,
  onUpdateDownloadProxyChange,
  onSaveUpdateDownloadProxy,
}: {
  onClose: () => void;
  onConfirmUpdate: () => void;
  updateSource: string;
  updateDownloadProxy: string;
  onUpdateDownloadProxyChange: (proxy: string) => void;
  onSaveUpdateDownloadProxy: () => void;
}) {
  const [versionInfo, setVersionInfo] = useState<null | SystemVersionInfo>(null);
  const { modalView, setModalView, otaState } = useUpdateStore();
  const [send] = useJsonRpc();

  const onFinishedLoading = useCallback(
    async (info: SystemVersionInfo) => {
      const hasUpdate = info?.systemUpdateAvailable || info?.appUpdateAvailable;

      setVersionInfo(info);

      if (hasUpdate) {
        setModalView("updateAvailable");
      } else {
        setModalView("upToDate");
      }
    },
    [setModalView],
  );

  useEffect(() => {
    setVersionInfo(null);
  }, [setModalView]);

  return (
    <div className="text-left">
      {modalView === "error" && (
        <UpdateErrorState
          errorMessage={otaState.error}
          onClose={onClose}
          onRetryUpdate={() => setModalView("loading")}
        />
      )}

      {modalView === "loading" && (
        <LoadingState onFinished={onFinishedLoading} onCancelCheck={onClose} />
      )}

      {modalView === "updateAvailable" && (
        <UpdateAvailableState
          onConfirmUpdate={onConfirmUpdate}
          onClose={onClose}
          versionInfo={versionInfo!}
          updateSource={updateSource}
          updateDownloadProxy={updateDownloadProxy}
          onUpdateDownloadProxyChange={onUpdateDownloadProxyChange}
          onSaveUpdateDownloadProxy={onSaveUpdateDownloadProxy}
        />
      )}

      {modalView === "updating" && (
        <UpdatingDeviceState otaState={otaState} onMinimizeUpgradeDialog={onClose} />
      )}

      {modalView === "upToDate" && (
        <SystemUpToDateState
          checkUpdate={() => setModalView("loading")}
          onClose={onClose}
          versionInfo={versionInfo}
        />
      )}

      {modalView === "updateCompleted" && <UpdateCompletedState onClose={onClose} />}
    </div>
  );
}

function LoadingState({
  onFinished,
  onCancelCheck,
}: {
  onFinished: (versionInfo: SystemVersionInfo) => void;
  onCancelCheck: () => void;
}) {
  const { $at } = useReactAt();
  const [progressWidth, setProgressWidth] = useState("0%");
  const abortControllerRef = useRef<AbortController | null>(null);
  const [send] = useJsonRpc();

  const setAppVersion = useDeviceStore(state => state.setAppVersion);
  const setSystemVersion = useDeviceStore(state => state.setSystemVersion);

  const getVersionInfo = useCallback(() => {
    return new Promise<SystemVersionInfo>((resolve, reject) => {
      Promise.all([
        new Promise<SystemVersionInfo>((res, rej) => {
          send("getUpdateStatus", {}, resp => {
            if ("error" in resp) {
              notifications.error(`Failed to check for updates: ${resp.error}`);
              rej(new Error("Failed to check for updates"));
            } else {
              const result = resp.result as SystemVersionInfo;
              setAppVersion(result.local.appVersion);
              setSystemVersion(result.local.systemVersion);
              if (result.error) {
                notifications.error(`Failed to check for updates: ${result.error}`);
                rej(new Error("Failed to check for updates"));
              } else {
                res(result);
              }
            }
          });
        }),
        new Promise<SystemVersionInfo>((res, rej) => {
          send("getSelfSignatureStatus", {}, resp => {
            if ("error" in resp) {
              rej(new Error("Failed to get signature status"));
            } else {
              const sigStatus = resp.result as {
                appSignatureAbsent: boolean;
                appSignatureInvalid: boolean;
                appNoPublicKey: boolean;
              };
              const hasSigFiles = !sigStatus.appSignatureAbsent;
              const signatureVerified = hasSigFiles && !sigStatus.appNoPublicKey && !sigStatus.appSignatureInvalid;
              const partial: Partial<SystemVersionInfo> = {
                appSignatureAbsent: sigStatus.appSignatureAbsent,
                appSignatureInvalid: sigStatus.appSignatureInvalid,
                appNoPublicKey: sigStatus.appNoPublicKey,
                signatureVerified,
              };
              res(partial as SystemVersionInfo);
            }
          });
        }),
      ])
        .then(([versionResult, sigResult]) => {
          resolve({
            ...versionResult,
            appSignatureAbsent: sigResult.appSignatureAbsent,
            appSignatureInvalid: sigResult.appSignatureInvalid,
            appNoPublicKey: sigResult.appNoPublicKey,
            signatureVerified: sigResult.signatureVerified,
          });
        })
        .catch(reject);
    });
  }, [send, setAppVersion, setSystemVersion]);

  const progressBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setProgressWidth("0%");

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const animationTimer = setTimeout(() => {
      setProgressWidth("100%");
    }, 0);

    getVersionInfo()
      .then(versionInfo => {
        return new Promise(resolve => setTimeout(() => resolve(versionInfo), 600));
      })
      .then(versionInfo => {
        if (!signal.aborted) {
          onFinished(versionInfo as SystemVersionInfo);
        }
      })
      .catch(error => {
        if (!signal.aborted) {
          console.error("LoadingState: Error fetching version info", error);
        }
      });

    return () => {
      clearTimeout(animationTimer);
      abortControllerRef.current?.abort();
    };
  }, [getVersionInfo, onFinished]);

  return (
    <div className="flex flex-col items-stretch justify-start space-y-4 text-left">
      <div className="space-y-4">
        <div className="space-y-0">
          <p className="text-base font-semibold text-black dark:text-white">
            {$at("Checking for updates...")}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {$at("We're ensuring your device has the latest features and improvements.")}
          </p>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-300">
          <div
            ref={progressBarRef}
            style={{ width: progressWidth }}
            className="h-2.5 bg-[rgba(22,152,217,1)] dark:bg-[rgba(45,106,229,1)] transition-all duration-1000 ease-in-out"
          ></div>
        </div>
        <div className="mt-4">
          <AntdButton type="primary" onClick={onCancelCheck}>
            {$at("Cancel")}
          </AntdButton>
        </div>
      </div>
    </div>
  );
}

function UpdatingDeviceState({
  otaState,
  onMinimizeUpgradeDialog,
}: {
  otaState: UpdateState["otaState"];
  onMinimizeUpgradeDialog: () => void;
}) {
  const formatProgress = (progress: number) => `${Math.round(progress)}%`;

  const calculateOverallProgress = (type: "system" | "app") => {
    const downloadProgress = (otaState[`${type}DownloadProgress`] ?? 0) * 100;
    const updateProgress = (otaState[`${type}UpdateProgress`] ?? 0) * 100;
    const verificationProgress = (otaState[`${type}VerificationProgress`] ?? 0) * 100;

    if (!downloadProgress && !updateProgress && !verificationProgress) {
      return 0;
    }

    console.log(
      `For ${type}:\n` +
        `  Download Progress: ${downloadProgress}% (${otaState[`${type}DownloadProgress`]})\n` +
        `  Update Progress: ${updateProgress}% (${otaState[`${type}UpdateProgress`]})\n` +
        `  Verification Progress: ${verificationProgress}% (${otaState[`${type}VerificationProgress`]})`,
    );

    if (type === "app") {
      return Math.min(
        downloadProgress * 0.55 + verificationProgress * 0.54 + updateProgress * 0.01,
        100,
      );
    } else {
      return Math.min(
        downloadProgress * 0.4 + verificationProgress * 0.1 + updateProgress * 0.5,
        100,
      );
    }
  };

  const getUpdateStatus = (type: "system" | "app") => {
    const downloadFinishedAt = otaState[`${type}DownloadFinishedAt`];
    const verfiedAt = otaState[`${type}VerifiedAt`];
    const updatedAt = otaState[`${type}UpdatedAt`];
    const downloadSpeedBps = (otaState as any)[`${type}DownloadSpeedBps`] as number | undefined;
    const formattedSpeed =
      downloadSpeedBps && downloadSpeedBps > 0 ? `${formatters.bytes(downloadSpeedBps, 1)}/s` : null;

    if (!otaState.metadataFetchedAt) {
      return "Fetching update information...";
    } else if (!downloadFinishedAt) {
      return formattedSpeed ? `Downloading ${type} update... (${formattedSpeed})` : `Downloading ${type} update...`;
    } else if (!verfiedAt) {
      return `Verifying ${type} update...`;
    } else if (!updatedAt) {
      return `Installing ${type} update...`;
    } else {
      return `Awaiting reboot`;
    }
  };

  const isUpdateComplete = (type: "system" | "app") => {
    return !!otaState[`${type}UpdatedAt`];
  };

  const areAllUpdatesComplete = () => {
    if (otaState.systemUpdatePending && otaState.appUpdatePending) {
      return isUpdateComplete("system") && isUpdateComplete("app");
    }
    return (
      (otaState.systemUpdatePending && isUpdateComplete("system")) ||
      (otaState.appUpdatePending && isUpdateComplete("app"))
    );
  };
  const { $at } = useReactAt();
  return (
    <div className="flex flex-col items-start justify-start space-y-4 text-left">
      <div className="w-full space-y-4">
        <div className="space-y-0">
          <p className="text-base font-semibold text-black dark:text-white">
            {$at("Updating your device")}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {$at("Please don't turn off your device. This process may take a few minutes.")}
          </p>
        </div>
        <Card className="space-y-4 p-4">
          {areAllUpdatesComplete() ? (
            <div className="my-2 flex flex-col items-center space-y-2 text-center">
              <LoadingSpinner className="h-6 w-6 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-black dark:text-white">
                  {$at("Rebooting to complete the update...")}
                </span>
              </div>
            </div>
          ) : (
            <>
              {!(otaState.systemUpdatePending || otaState.appUpdatePending) && (
                <div className="my-2 flex flex-col items-center space-y-2 text-center">
                  <LoadingSpinner className="h-6 w-6 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                </div>
              )}

              {otaState.systemUpdatePending && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-black dark:text-white">
                      {$at("Linux System Update")}
                    </p>
                    {calculateOverallProgress("system") < 100 ? (
                      <LoadingSpinner className="h-4 w-4 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                    ) : (
                      <CheckCircleIcon className="h-4 w-4 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                    )}
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-slate-600">
                    <div
                      className="h-2.5 rounded-full bg-[rgba(22,152,217,1)] transition-all duration-500 ease-linear dark:bg-[rgba(45,106,229,1)]"
                      style={{
                        width: formatProgress(calculateOverallProgress("system")),
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                    <span>{getUpdateStatus("system")}</span>
                    {calculateOverallProgress("system") < 100 ? (
                      <span>{formatProgress(calculateOverallProgress("system"))}</span>
                    ) : null}
                  </div>
                </div>
              )}
              {otaState.appUpdatePending && (
                <>
                  {otaState.systemUpdatePending && (
                    <hr className="dark:border-slate-600" />
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-black dark:text-white">
                        {$at("App Update")}
                      </p>
                      {calculateOverallProgress("app") < 100 ? (
                        <LoadingSpinner className="h-4 w-4 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                      )}
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-slate-600">
                      <div
                        className="h-2.5 rounded-full bg-[rgba(22,152,217,1)] transition-all duration-500 ease-linear dark:bg-[rgba(45,106,229,1)]"
                        style={{
                          width: formatProgress(calculateOverallProgress("app")),
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                      <span>{getUpdateStatus("app")}</span>
                      {calculateOverallProgress("app") < 100 ? (
                        <span>{formatProgress(calculateOverallProgress("app"))}</span>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
        <div className="mt-4 flex justify-start gap-x-2 text-white">
          <AntdButton
            type="primary"
            onClick={onMinimizeUpgradeDialog}
          >
            {$at("Update in Background")}
          </AntdButton>
        </div>
      </div>
    </div>
  );
}

function SystemUpToDateState({
  checkUpdate,
  onClose,
  versionInfo,
}: {
  checkUpdate: () => void;
  onClose: () => void;
  versionInfo: SystemVersionInfo | null;
}) {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();
  const [sigUpdateLoading, setSigUpdateLoading] = useState(false);
  const [sigUpdateResult, setSigUpdateResult] = useState<string | null>(null);
  const hasAbsentSig = versionInfo?.appSignatureAbsent;
  const hasInvalidSig = versionInfo?.appSignatureInvalid;
  const hasNoPublicKey = versionInfo?.appNoPublicKey;

  const handleUpdateSignatures = useCallback(() => {
    setSigUpdateLoading(true);
    setSigUpdateResult(null);
    send("updateSignatures", {}, resp => {
      setSigUpdateLoading(false);
      if ("error" in resp) {
        setSigUpdateResult(`Failed: ${resp.error.data || "Unknown error"}`);
        notifications.error(`Signature update failed: ${resp.error.data || "Unknown error"}`);
      } else {
        const result = resp.result as {
          appSignatureUpdated: boolean;
          systemSignatureUpdated: boolean;
          appSignatureValid: boolean;
          systemSignatureValid: boolean;
          error?: string;
        };
        if (result.error) {
          setSigUpdateResult(`Failed: ${result.error}`);
          notifications.error(`Signature update failed: ${result.error}`);
        } else {
          const parts: string[] = [];
          if (result.appSignatureUpdated) parts.push("App signature updated");
          if (result.systemSignatureUpdated) parts.push("System signature updated");
          setSigUpdateResult(parts.join(", ") || "No signatures to update");
          notifications.success("Signatures updated successfully");
        }
      }
    });
  }, [send]);

  return (
    <div className="flex flex-col items-start justify-start space-y-4 text-left">
      <div className="text-left">
        <p className="text-base font-semibold text-black dark:text-white">
          {$at("System is up to date")}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {$at("Your system is running the latest version. No updates are currently available.")}
        </p>

        {hasAbsentSig && (
          <div className="mt-4 rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {$at("Missing Signature File")}
            </p>
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
              {$at("The current firmware is missing signature files. Integrity cannot be fully verified.")}
            </p>
          </div>
        )}

        {hasInvalidSig && (
          <div className="mt-4 rounded-md border border-red-500 bg-red-50 p-3 dark:border-red-600 dark:bg-red-900/30">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {$at("Signature Verification Failed")}
            </p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              {$at("The signature file exists but does not match the firmware. This may indicate tampering.")}
            </p>
          </div>
        )}

        {hasNoPublicKey && (
          <div className="mt-4 rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {$at("No Embedded Public Key")}
            </p>
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
              {$at("This build does not have an OTA public key embedded. Signature verification is unavailable.")}
            </p>
          </div>
        )}

        <div className="mt-4 flex gap-x-2">
          <AntdButton type="primary" onClick={checkUpdate}>
            {$at("Check Again")}
          </AntdButton>
          <AntdButton type="primary" onClick={onClose}>
            {$at("Back")}
          </AntdButton>
        </div>

        <p className="text-base font-semibold text-black dark:text-white">
          {$at("Update Signatures")}
        </p>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
          {$at("Update the signature of kvm_app to the latest version. If the current version is not up to date, signature verification will fail.")}
        </p>

        {sigUpdateResult && (
          <div className="rounded-md border border-blue-500 bg-blue-50 p-3 dark:border-blue-600 dark:bg-blue-900/30">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {$at("Signature Update Result")}
            </p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              {sigUpdateResult}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-start gap-x-2">
            <AntdButton type="primary" loading={sigUpdateLoading} onClick={handleUpdateSignatures}>
              {$at("Update")}
            </AntdButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdateAvailableState({
  versionInfo,
  onConfirmUpdate,
  onClose,
  updateSource,
  updateDownloadProxy,
  onUpdateDownloadProxyChange,
  onSaveUpdateDownloadProxy,
}: {
  versionInfo: SystemVersionInfo;
  onConfirmUpdate: () => void;
  onClose: () => void;
  updateSource: string;
  updateDownloadProxy: string;
  onUpdateDownloadProxyChange: (proxy: string) => void;
  onSaveUpdateDownloadProxy: () => void;
}) {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();
  const [sigUpdateLoading, setSigUpdateLoading] = useState(false);
  const [sigUpdateResult, setSigUpdateResult] = useState<string | null>(null);

  const handleUpdateSignatures = useCallback(() => {
    setSigUpdateLoading(true);
    setSigUpdateResult(null);
    send("updateSignatures", {}, resp => {
      setSigUpdateLoading(false);
      if ("error" in resp) {
        setSigUpdateResult(`Failed: ${resp.error.data || "Unknown error"}`);
        notifications.error(`Signature update failed: ${resp.error.data || "Unknown error"}`);
      } else {
        const result = resp.result as {
          appSignatureUpdated: boolean;
          systemSignatureUpdated: boolean;
          appSignatureValid: boolean;
          systemSignatureValid: boolean;
          error?: string;
        };
        if (result.error) {
          setSigUpdateResult(`Failed: ${result.error}`);
          notifications.error(`Signature update failed: ${result.error}`);
        } else {
          const parts: string[] = [];
          if (result.appSignatureUpdated) parts.push("App signature updated");
          if (result.systemSignatureUpdated) parts.push("System signature updated");
          setSigUpdateResult(parts.join(", ") || "No signatures to update");
          notifications.success("Signatures updated successfully");
        }
      }
    });
  }, [send]);

  return (
    <div className="flex flex-col items-start justify-start space-y-4 text-left">
      <div className="w-full space-y-4">
        <div className="space-y-0">
          <p className="text-base font-semibold text-black dark:text-white">
            {$at("Update available")}
          </p>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {$at("A new update is available to enhance system performance and improve compatibility. We recommend updating to ensure everything runs smoothly.")}
          </p>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            {versionInfo?.systemUpdateAvailable ? (
              <>
                <span className="font-semibold">System:</span> {versionInfo?.remote?.systemVersion}
                <br />
              </>
            ) : null}
            {versionInfo?.appUpdateAvailable ? (
              <>
                <span className="font-semibold">App:</span> {versionInfo?.remote?.appVersion}
              </>
            ) : null}
          </p>

          {updateSource === "github" && (
            <div className="mb-4 flex items-end gap-x-2">
              <InputFieldWithLabel
                size="SM"
                label={$at("Download Proxy Prefix")}
                value={updateDownloadProxy}
                onChange={e => onUpdateDownloadProxyChange(e.target.value)}
                placeholder="https://gh-proxy.com/"
              />
              <AntdButton type="primary" onClick={onSaveUpdateDownloadProxy}>
                {$at("Apply")}
              </AntdButton>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-start gap-x-2">
              <AntdButton type="primary" onClick={onConfirmUpdate}>
                {$at("Update Now")}
              </AntdButton>
              <AntdButton type="primary" onClick={onClose}>
                {$at("Do it later")}
              </AntdButton>
            </div>
          </div>

          <p className="text-base font-semibold text-black dark:text-white">
            {$at("Update Signatures")}
          </p>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {$at("Update the signature of kvm_app to the latest version. If the current version is not up to date, signature verification will fail.")}
          </p>

          {sigUpdateResult && (
            <div className="rounded-md border border-blue-500 bg-blue-50 p-3 dark:border-blue-600 dark:bg-blue-900/30">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {$at("Signature Update Result")}
              </p>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                {sigUpdateResult}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-start gap-x-2">
              <AntdButton type="primary" loading={sigUpdateLoading} onClick={handleUpdateSignatures}>
                {$at("Update")}
              </AntdButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdateCompletedState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-start justify-start space-y-4 text-left">
      <div className="text-left">
        <p className="text-base font-semibold dark:text-white">
          Update Completed Successfully
        </p>
        <p className="mb-4 text-sm text-slate-600 dark:text-[#ffffff]">
          Your device has been successfully updated to the latest version. Enjoy the new features
          and improvements!
        </p>
        <div className="flex items-center justify-start">
          <Button size="SM" theme="primary" text="Back" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

function UpdateErrorState({
  errorMessage,
  onClose,
  onRetryUpdate,
}: {
  errorMessage: string | null;
  onClose: () => void;
  onRetryUpdate: () => void;
}) {
  const { $at } = useReactAt();
  return (
    <div className="flex flex-col items-start justify-start space-y-4 text-left">
      <div className="text-left">
        <p className="text-base font-semibold dark:text-white">
          {$at("Update Error")}
        </p>
        <p className="mb-4 text-sm text-slate-600 dark:text-[#ffffff]">
          {$at("An error occurred while updating your device. Please try again later.")}
        </p>
        {errorMessage && (
          <p className="mb-4 text-sm font-medium text-red-600 dark:text-red-400">
            {$at("Error details:")} {errorMessage}
          </p>
        )}
        <div className="flex items-center justify-start gap-x-2">
          <AntdButton type="primary" onClick={onClose}>
            {$at("Back")}
          </AntdButton>
          <AntdButton type="primary" onClick={onRetryUpdate}>
            {$at("Retry")}
          </AntdButton>
        </div>
      </div>
    </div>
  );
}

function SignatureStatusCard({
  signatureStatus,
  signatureStatusLoading,
}: {
  signatureStatus: {
    appSignatureAbsent: boolean;
    appSignatureInvalid: boolean;
    appNoPublicKey: boolean;
    signatureVerified: boolean;
  } | null;
  signatureStatusLoading: boolean;
}) {
  const { $at } = useReactAt();
  if (signatureStatusLoading) {
    return (
      <div className="rounded-md border border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/30">
        <div className="flex items-center gap-x-2">
          <LoadingSpinner className="h-4 w-4 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {$at("Verifying signature...")}
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {$at("Please wait while verifying firmware signature.")}
        </p>
      </div>
    );
  }

  if (!signatureStatus) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          {$at("Signature Status Unavailable")}
        </p>
        <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
          {$at("Unable to retrieve signature verification status.")}
        </p>
      </div>
    );
  }

  if (signatureStatus.signatureVerified) {
    return (
      <div className="rounded-md border border-green-500 bg-green-50 p-3 dark:border-green-600 dark:bg-green-900/30">
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          <CheckCircleIcon className="inline h-4 w-4 mr-1" />
          {$at("Signature Verified")}
        </p>
        <p className="mt-1 text-xs text-green-700 dark:text-green-300">
          {$at("Firmware signature has been verified and is valid.")}
        </p>
      </div>
    );
  }

  if (signatureStatus.appSignatureAbsent) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          {$at("Missing Signature File")}
        </p>
        <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
          {$at("The current firmware is missing signature files. Integrity cannot be fully verified.")}
        </p>
      </div>
    );
  }

  if (signatureStatus.appSignatureInvalid) {
    return (
      <div className="rounded-md border border-red-500 bg-red-50 p-3 dark:border-red-600 dark:bg-red-900/30">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          {$at("Signature Verification Failed")}
        </p>
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          {$at("The signature file exists but does not match the firmware. This may indicate tampering.")}
        </p>
      </div>
    );
  }

  if (signatureStatus.appNoPublicKey) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          {$at("No Embedded Public Key")}
        </p>
        <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
          {$at("This build does not have an OTA public key embedded. Signature verification is unavailable.")}
        </p>
      </div>
    );
  }

  return null;
}
