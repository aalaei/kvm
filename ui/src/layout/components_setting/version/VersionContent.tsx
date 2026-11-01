
import { useCallback, useEffect, useRef, useState } from "react";
import { Button as AntdButton, Select } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { isMobile } from "react-device-detect";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { SettingsItem } from "@components/Settings/SettingsView";
import Card from "@components/Card";
import LoadingSpinner from "@components/LoadingSpinner";
import { Button } from "@components/Button";
import { InputFieldWithLabel } from "@components/InputField";
import { UpdateState, useDeviceStore, useUpdateStore } from "@/hooks/stores";
import notifications from "@/notifications";
import { formatters } from "@/utils";
import UploadSvg from "@/assets/second/upload.svg?react";
import { text_primary_color } from "@/layout/theme_color";
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

export interface LocalPackageInfo {
  appVersion: string;
  systemVersion: string;
  hasApp: boolean;
  hasSystem: boolean;
}

type SignatureStatus = {
  appSignatureAbsent: boolean;
  appSignatureInvalid: boolean;
  appNoPublicKey: boolean;
  signatureVerified: boolean;
};

type UploadLocalPackageOptions = {
  onUploadProgress?: (progress: number) => void;
  onUploadComplete?: () => void;
};

const uploadLocalPackage = async (
  file: File,
  options?: UploadLocalPackageOptions,
): Promise<void> => {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = event => {
      if (!event.lengthComputable || !options?.onUploadProgress) return;
      const progress = Math.min((event.loaded / event.total) * 100, 100);
      options.onUploadProgress(progress);
    };
    xhr.upload.onload = () => {
      options?.onUploadProgress?.(100);
      options?.onUploadComplete?.();
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve();
      } else {
        try {
          const resp = JSON.parse(xhr.responseText);
          reject(new Error(resp.error || "Upload failed"));
        } catch {
          reject(new Error(xhr.responseText || "Upload failed"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("POST", "/ota/upload-local-pkg");
    xhr.send(formData);
  });
};

export default function SettingsVersion() {
  const [send] = useJsonRpc();
  const { $at } = useReactAt();
  const {
    setModalView,
    modalView,
    otaState,
    versionUpdateSource: updateSource,
    setVersionUpdateSource: setUpdateSource,
    versionLocalPackageInfo: localPackageInfo,
    setVersionLocalPackageInfo: setLocalPackageInfo,
  } = useUpdateStore();
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [localPackageInfoChecked, setLocalPackageInfoChecked] = useState(false);
  const [signatureStatusLoading, setSignatureStatusLoading] = useState(false);
  const [signatureStatusChecked, setSignatureStatusChecked] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus | null>(null);
  const updatePanelRef = useRef<HTMLDivElement | null>(null);
  const [customUpdateBaseURL, setCustomUpdateBaseURL] = useState("");
  const [updateDownloadProxy, setUpdateDownloadProxy] = useState("");

  const currentVersions = useDeviceStore(state => {
    const { appVersion, systemVersion } = state;
    if (!appVersion || !systemVersion) return null;
    return { appVersion, systemVersion };
  });

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

  useEffect(() => {
    if (updateSource !== "local") {
      setLocalPackageInfoChecked(false);
      return;
    }
    if (localPackageInfo || localPackageInfoChecked) return;

    setLocalPackageInfoChecked(true);
    send("getLocalPackageInfo", {}, resp => {
      if ("error" in resp) return;
      setLocalPackageInfo((resp.result as LocalPackageInfo | null) ?? null);
    });
  }, [localPackageInfo, localPackageInfoChecked, send, setLocalPackageInfo, updateSource]);

  const clearLocalPackage = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      send("clearLocalPackage", {}, resp => {
        if ("error" in resp) {
          reject(new Error((resp.error.data as string) || "Failed to clear local package"));
        } else {
          resolve();
        }
      });
    });
  }, [send]);

  const verifySignatureStatus = useCallback(() => {
    setSignatureStatusLoading(true);
    send("getSelfSignatureStatus", {}, resp => {
      setSignatureStatusLoading(false);
      setSignatureStatusChecked(true);
      if ("error" in resp) {
        setSignatureStatus(null);
        notifications.error(`Failed to verify signature: ${resp.error.data || "Unknown error"}`);
        return;
      }
      const sigStatus = resp.result as Omit<SignatureStatus, "signatureVerified">;
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

  const closeUpdateDialog = useCallback(async () => {
    if (updateSource === "local" && otaState.error) {
      try {
        await clearLocalPackage();
        setLocalPackageInfoChecked(false);
        setLocalPackageInfo(null);
      } catch (err) {
        notifications.error(err instanceof Error ? err.message : "Failed to clear local package");
        return;
      }
    }

    setIsUpdateDialogOpen(false);
  }, [clearLocalPackage, otaState.error, setLocalPackageInfo, updateSource]);

  const resetLocalPackageUi = useCallback(() => {
    setLocalPackageInfoChecked(false);
    setLocalPackageInfo(null);
    setIsUpdateDialogOpen(false);
    setModalView("loading");
  }, [setLocalPackageInfo, setModalView]);

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

  const startLocalUpdate = useCallback(() => {
    send("setUpdateSource", { source: "local" }, resp => {
      if ("error" in resp) {
        notifications.error(`Failed to set update source: ${resp.error.data || "Unknown error"}`);
        return;
      }

      setIsUpdateDialogOpen(true);
      setModalView("updating");
      setTimeout(() => updatePanelRef.current?.scrollIntoView({ block: "nearest" }), 0);
      send("tryUpdate", {});
    });
  }, [send, setModalView]);

  useEffect(() => {
    if (!isUpdateDialogOpen) return;
    if (otaState.updating && modalView !== "updating") {
      setModalView("updating");
    } else if (otaState.error && modalView !== "error") {
      setModalView("error");
    }
  }, [isUpdateDialogOpen, modalView, otaState.updating, otaState.error, setModalView]);

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={$at("Version")}
        description={$at("Check the versions of the system and applications")}
      />

      <div className="space-y-4">
        <div className="space-y-4 pb-2">
          <div className="flex items-start justify-between gap-4">
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
            <AntdButton
              type="primary"
              loading={signatureStatusLoading}
              onClick={verifySignatureStatus}
              className="shrink-0"
            >
              {$at("Verify Signature")}
            </AntdButton>
          </div>

          {signatureStatusChecked && (
            <SignatureStatusCard
              signatureStatus={signatureStatus}
              signatureStatusLoading={signatureStatusLoading}
            />
          )}

            <>
              <UpdateSourceSettings
                updateSource={updateSource}
                onUpdateSourceChange={applyUpdateSource}
                customUpdateBaseURL={customUpdateBaseURL}
                onCustomUpdateBaseURLChange={setCustomUpdateBaseURL}
                onSaveCustomUpdateBaseURL={applyCustomUpdateBaseURL}
              />

              {updateSource === "local" ? (
                <LocalPackageUpload
                  packageInfo={localPackageInfo}
                  onClearPackage={clearLocalPackage}
                  onPackageReady={(info) => {
                    setLocalPackageInfoChecked(true);
                    setLocalPackageInfo(info);
                  }}
                  onPackageReset={resetLocalPackageUi}
                />
              ) : (
                <div className="flex items-center justify-start">
                  <AntdButton type="primary" onClick={checkForUpdates} className={isMobile ? "w-full" : ""}>
                    {$at("Check for Updates")}
                  </AntdButton>
                </div>
              )}
              
              {updateSource === "local" && localPackageInfo && !isUpdateDialogOpen && (
                <div className="flex items-center justify-start">
                  <AntdButton
                    type="primary"
                    onClick={startLocalUpdate}
                    className={isMobile ? "w-full" : ""}
                  >
                    {$at("Start Update")}
                  </AntdButton>
                </div>
              )}
            </>

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

function LocalPackageUpload({
  packageInfo,
  onClearPackage,
  onPackageReady,
  onPackageReset,
}: {
  packageInfo: LocalPackageInfo | null;
  onClearPackage: () => Promise<void>;
  onPackageReady: (info: LocalPackageInfo) => void;
  onPackageReset: () => void;
}) {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();
  const [uploading, setUploading] = useState(false);
  const [clearingPackage, setClearingPackage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "extracting" | "readingInfo">(
    "idle",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      setError($at("File must be a .zip archive"));
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadStage("uploading");

    try {
      await uploadLocalPackage(file, {
        onUploadProgress: progress => {
          setUploadProgress(progress);
        },
        onUploadComplete: () => {
          setUploadProgress(100);
          setUploadStage("extracting");
        },
      });

      setUploadStage("readingInfo");
      const result = await new Promise<LocalPackageInfo>((resolve, reject) => {
        send("getLocalPackageInfo", {}, (resp) => {
          if ("error" in resp) {
            reject(new Error(resp.error.data || "Failed to get package info"));
          } else {
            resolve(resp.result as LocalPackageInfo);
          }
        });
      });

      onPackageReady(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadStage("idle");
    }
  };

  const handleReset = async () => {
    setClearingPackage(true);
    try {
      await onClearPackage();
      setError(null);
      setUploadProgress(0);
      setUploadStage("idle");
      onPackageReset();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : "Failed to clear local package");
    } finally {
      setClearingPackage(false);
    }
  };

  // Show package info after successful upload
  if (packageInfo) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <LocalPackageStepTimeline
          activeStep={4}
          title={$at("Package ready")}
          description={$at("Upload, extraction, and package parsing are complete.")}
        />
        <div className="mb-2 flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {$at("Package uploaded successfully")}
          </p>
        </div>
        <div className="ml-7 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {packageInfo.hasApp && (
            <p>{$at("App Version")}: {packageInfo.appVersion}</p>
          )}
          {packageInfo.hasSystem && (
            <p>{$at("System Version")}: {packageInfo.systemVersion}</p>
          )}
        </div>
        <button
          onClick={handleReset}
          disabled={clearingPackage}
          className="mt-3 ml-7 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          {clearingPackage ? $at("Removing package...") : $at("Upload different package")}
        </button>
      </div>
    );
  }

  // File upload area
  return (
    <div>
      <label
        className={`block cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        <Card
          className="transition-all duration-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/50"
        >
          <div className="w-full px-4 py-6">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="space-y-1">
                <div className="inline-block">
                  <div className="p-1">
                    <UploadSvg className={`h-[24px] w-[24px] shrink-0 ${text_primary_color}`} />
                  </div>
                </div>
                <div
                  style={{ fontSize: "14px", fontWeight: "400" }}
                  className="text-[rgba(22,152,217,1)] dark:text-white"
                >
                  {$at("Choose upgrade package (.zip)")}
                </div>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </Card>
      </label>
      {uploading && (
        <div className="mt-3">
          <LocalPackageUploadStatus stage={uploadStage} uploadProgress={uploadProgress} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function LocalPackageStepTimeline({
  activeStep,
  transitionProgress = 0,
  title,
  description,
  showSpinner = false,
  statusText,
}: {
  activeStep: number;
  transitionProgress?: number;
  title: string;
  description: string;
  showSpinner?: boolean;
  statusText?: string;
}) {
  const steps = ["Start", "Uploaded", "Extracted", "Parsed"];
  const clampedStep = Math.max(1, Math.min(activeStep, steps.length));
  const clampedTransitionProgress = Math.max(0, Math.min(transitionProgress, 100));

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {showSpinner ? (
              <LoadingSpinner className="h-5 w-5 text-[rgba(22,152,217,1)] dark:text-[rgba(120,184,255,1)]" />
            ) : null}
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          </div>
          {statusText ? (
            <span className="text-xs font-medium text-[rgba(22,152,217,1)] dark:text-[rgba(120,184,255,1)]">
              {statusText}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const active = stepNumber <= clampedStep;
          const isLast = index === steps.length - 1;
          return (
            <div key={step} className={`flex min-w-0 items-center ${isLast ? "" : "flex-1"}`}>
              <span
                className={`h-3 w-3 shrink-0 rounded-full border transition-colors duration-300 ${
                  active
                    ? "border-[rgba(22,152,217,1)] bg-[rgba(22,152,217,1)] dark:border-[rgba(120,184,255,1)] dark:bg-[rgba(120,184,255,1)]"
                    : "border-sky-200 bg-white dark:border-slate-600 dark:bg-slate-800"
                }`}
              />
              {!isLast && (
                <span className="relative mx-2 h-[2px] flex-1 rounded-full bg-sky-200 dark:bg-slate-700">
                  <span
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                      stepNumber < clampedStep || (stepNumber === clampedStep && clampedTransitionProgress > 0)
                        ? "bg-[rgba(22,152,217,1)] dark:bg-[rgba(120,184,255,1)]"
                        : "bg-transparent"
                    }`}
                    style={{
                      width:
                        stepNumber < clampedStep
                          ? "100%"
                          : stepNumber === clampedStep
                            ? `${clampedTransitionProgress}%`
                            : "0%",
                    }}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocalPackageUploadStatus({
  stage,
  uploadProgress,
}: {
  stage: "idle" | "uploading" | "extracting" | "readingInfo";
  uploadProgress: number;
}) {
  const { $at } = useReactAt();

  if (stage === "uploading") {
    return (
      <LocalPackageStepTimeline
        activeStep={1}
        transitionProgress={uploadProgress}
        title={$at("Uploading package")}
        description={$at("Please wait while the local upgrade package is being uploaded.")}
        showSpinner
        statusText={`${Math.round(uploadProgress)}%`}
      />
    );
  }

  if (stage === "extracting") {
    return (
      <LocalPackageStepTimeline
        activeStep={2}
        title={$at("Extracting package")}
        description={$at("The device is unpacking and validating the uploaded package.")}
        showSpinner
      />
    );
  }

  if (stage === "readingInfo") {
    return (
      <LocalPackageStepTimeline
        activeStep={3}
        title={$at("Reading package information")}
        description={$at("Checking version.txt and detecting included app and system files.")}
        showSpinner
      />
    );
  }

  return null;
}

const updateSourceOptions = [
  //{ value: "cdn", label: "CDN" },
  { value: "github", label: "github" },
  //{ value: "gitee", label: "gitee" },
  { value: "custom", label: "custom" },
  { value: "local", label: "local" },
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
        <UpdatingDeviceState otaState={otaState} updateSource={updateSource} onMinimizeUpgradeDialog={onClose} />
      )}

      {modalView === "upToDate" && (
        <SystemUpToDateState
          checkUpdate={() => setModalView("loading")}
          onClose={onClose}
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
      send("getUpdateStatus", {}, resp => {
        if ("error" in resp) {
          notifications.error(`Failed to check for updates: ${resp.error}`);
          reject(new Error("Failed to check for updates"));
          return;
        }

        const result = resp.result as SystemVersionInfo;
        setAppVersion(result.local.appVersion);
        setSystemVersion(result.local.systemVersion);
        if (result.error) {
          notifications.error(`Failed to check for updates: ${result.error}`);
          reject(new Error("Failed to check for updates"));
          return;
        }
        resolve(result);
      });
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
          console.error("Failed to load version info", error);
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
  updateSource,
  onMinimizeUpgradeDialog,
}: {
  otaState: UpdateState["otaState"];
  updateSource: string;
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
    const downloadProgress = otaState[`${type}DownloadProgress`] ?? 0;
    const verificationProgress = otaState[`${type}VerificationProgress`] ?? 0;
    const downloadSpeedBps = (otaState as any)[`${type}DownloadSpeedBps`] as number | undefined;
    const formattedSpeed =
      downloadSpeedBps && downloadSpeedBps > 0 ? `${formatters.bytes(downloadSpeedBps, 1)}/s` : null;

    if (updateSource === "local") {
      if (updatedAt) {
        return "Awaiting reboot";
      } else if (verfiedAt) {
        return `Installing ${type} update...`;
      } else if (verificationProgress > 0 || downloadProgress >= 1) {
        return `Verifying ${type} update...`;
      } else {
        return `Preparing local ${type} update...`;
      }
    }

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
}: {
  checkUpdate: () => void;
  onClose: () => void;
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
      <div className="text-left">
        <p className="text-base font-semibold text-black dark:text-white">
          {$at("System is up to date")}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {$at("Your system is running the latest version. No updates are currently available.")}
        </p>

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
  signatureStatus: SignatureStatus | null;
  signatureStatusLoading: boolean;
}) {
  const { $at } = useReactAt();
  if (signatureStatusLoading) {
    return (
      <div className="rounded-md border border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/30">
        <div>
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
      </div>
    );
  }

  if (!signatureStatus) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {$at("Signature Status Unavailable")}
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            {$at("Unable to retrieve signature verification status.")}
          </p>
        </div>
      </div>
    );
  }

  if (signatureStatus.signatureVerified) {
    return (
      <div className="rounded-md border border-green-500 bg-green-50 p-3 dark:border-green-600 dark:bg-green-900/30">
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            <CheckCircleIcon className="mr-1 inline h-4 w-4" />
            {$at("Signature Verified")}
          </p>
          <p className="mt-1 text-xs text-green-700 dark:text-green-300">
            {$at("Firmware signature has been verified and is valid.")}
          </p>
        </div>
      </div>
    );
  }

  if (signatureStatus.appSignatureAbsent) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {$at("Missing Signature File")}
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            {$at("The current firmware is missing signature files. Integrity cannot be fully verified.")}
          </p>
        </div>
      </div>
    );
  }

  if (signatureStatus.appSignatureInvalid) {
    return (
      <div className="rounded-md border border-red-500 bg-red-50 p-3 dark:border-red-600 dark:bg-red-900/30">
        <div>
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {$at("Signature Verification Failed")}
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
            {$at("The signature file exists but does not match the firmware. This may indicate tampering.")}
          </p>
        </div>
      </div>
    );
  }

  if (signatureStatus.appNoPublicKey) {
    return (
      <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-600 dark:bg-yellow-900/30">
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {$at("No Embedded Public Key")}
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            {$at("This build does not have an OTA public key embedded. Signature verification is unavailable.")}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
