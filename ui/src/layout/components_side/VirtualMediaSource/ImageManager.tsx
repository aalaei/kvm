import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircleIcon } from "@heroicons/react/20/solid";
import { Checkbox , Button as AntdButton } from "antd";
import { useReactAt } from 'i18n-auto-extractor/react'
import { isMobile } from "react-device-detect";
import OnSDCardSvg from "@assets/second/noSD.svg?react"
import RefreshSvg from "@assets/second/refresh.svg?react"
import { LuRefreshCw } from "react-icons/lu";

import Card from "@components/Card";
import { Button } from "@components/Button";
import { formatters } from "@/utils";
import Fieldset from "@components/Fieldset";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { RemoteVirtualMediaState, useMountMediaStore } from "@/hooks/stores";
import notifications from "@/notifications";
import { SettingsItem } from "@components/Settings/SettingsView";
import { FileUploader } from "@components/FileManager/FileUploader";
import ViewHeader from "@/layout/components_side/VirtualMediaSource/ViewHeader";
import { UsbModeSelector } from "@components/FileManager/Mount";
import StorageSpaceBar from "@/layout/components_side/VirtualMediaSource/StorageSpaceBar";
import { dark_bd_style, dark_bg_desktop, dark_font_style , text_primary_color } from "@/layout/theme_color";
import { PreUploadedImageItem } from "@components/PreUploadedImageItem";

export interface FileManagerProps {
  storageType: 'kvm' | 'sd';
  showAutoMount?: boolean;
  autoMountTitle?: string;
  autoMountDescription?: string;

  listFilesApi: string;
  getSpaceApi: string;
  deleteFileApi: string;
  mountApi: string;
  getAutoMountApi?: string;
  setAutoMountApi?: string;
  unmountApi?: string;

  onMountSuccess?: () => void;
  customActions?: React.ReactNode;
  onNewImageClick?: (incompleteFile: string) => void;
}

export interface StorageFile {
  name: string;
  size: string;
  createdAt: string;
}

export interface StorageSpace {
  bytesUsed: number;
  bytesFree: number;
}

const isMountableVirtualMediaFile = (filename: string) => {
  const lower = filename.toLowerCase();
  return lower.endsWith(".img") || lower.endsWith(".iso");
};


const LoadingOverlay: React.FC = () => {
  const { $at } = useReactAt();

  return (
    <div className="absolute inset-0 bg-white/50 dark:bg-slate-800/50 flex items-center justify-center z-10 rounded-lg">
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <LuRefreshCw className="h-5 w-5 animate-spin text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
          <span className="text-sm font-medium">{$at("Processing...")}</span>
        </div>
      </div>
    </div>
  );
};

export default function ImageManager({
                                      storageType,
                                      showAutoMount = false,
                                      autoMountTitle = "Automatically mount system_info.img",
                                      autoMountDescription = "Mount system_info.img automatically when the KVM startup",
                                      listFilesApi,
                                      getSpaceApi,
                                      deleteFileApi,
                                      mountApi,
                                      getAutoMountApi,
                                      setAutoMountApi,
                                      unmountApi,
                                      onMountSuccess,
                                      customActions,
                                      onNewImageClick
                                    }: FileManagerProps) {
  const navigate = useNavigate();
  const { $at } = useReactAt();
  const [send] = useJsonRpc();

  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [usbMode, setUsbMode] = useState<RemoteVirtualMediaState["mode"]>("CDROM");
  const [currentPage, setCurrentPage] = useState(1);
  const [mountInProgress, setMountInProgress] = useState(false);
  const [autoMountSystemInfo, setAutoMountSystemInfo] = useState(false);
  const [storageSpace, setStorageSpace] = useState<StorageSpace | null>(null);
  const { remoteVirtualMediaState, setRemoteVirtualMediaState } = useMountMediaStore();
  const [sdMountStatus, setSDMountStatus] = useState<"ok" | "none" | "fail" | null>(storageType === 'sd' ? null : 'ok');
  const [loading, setLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<string | null>(null);
  const [fsType, setFsType] = useState<'exfat' | 'fat32'>('fat32');
  const filesPerPage = 5;

  const percentageUsed = useMemo(() => {
    if (!storageSpace) return 0;
    return Number(
      ((storageSpace.bytesUsed / (storageSpace.bytesUsed + storageSpace.bytesFree)) * 100).toFixed(1)
    );
  }, [storageSpace]);

  const currentFiles = useMemo(() => {
    const indexOfLastFile = currentPage * filesPerPage;
    const indexOfFirstFile = indexOfLastFile - filesPerPage;
    return storageFiles.slice(indexOfFirstFile, indexOfLastFile);
  }, [storageFiles, currentPage, filesPerPage]);

  const totalPages = Math.ceil(storageFiles.length / filesPerPage);

  const checkSDStatus = useCallback(() => {
    if (storageType !== 'sd') return;
    send("getSDMountStatus", {}, res => {
      if ("error" in res) {
        notifications.error(`Failed to check SD card status: ${res.error}`);
        setSDMountStatus(null);
        return;
      }
      const { status } = res.result as { status: "ok" | "none" | "fail" };
      setSDMountStatus(status);
    });
  }, [send, storageType]);

  const handleResetSDStorage = async () => {
    setLoading(true);
    send("resetSDStorage", {}, res => {
      if ("error" in res) {
        notifications.error(`Failed to reset SD card`);
        setLoading(false);
        return;
      }
      checkSDStatus();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  const handleUnmountSDStorage = async () => {
    if(!unmountApi) return;
    setLoading(true);
    send(unmountApi, {}, res => {
      if ("error" in res) {
        notifications.error(`Failed to unmount SD card`);
        setLoading(false);
        return;
      }
      setSDMountStatus(null);
      checkSDStatus();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  const handleFormatSDStorage = async () => {
    if (!window.confirm($at("Formatting the SD card will erase all data. Continue?"))) {
      return;
    }
    setLoading(true);
    send("formatSDStorage", { confirm: true, fsType }, res => {
      if ("error" in res) {
        notifications.error(res.error.data || res.error.message);
        setLoading(false);
        return;
      }
      notifications.success($at("SD card formatted successfully"));
      setSDMountStatus(null);
      checkSDStatus();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  const syncStorage = useCallback(() => {
    if (storageType === 'sd' && sdMountStatus !== 'ok') {
      return;
    }

    send(listFilesApi, {}, res => {
      if ("error" in res) {
        notifications.error(`Error listing storage files: ${res.error}`);
        return;
      }
      const { files } = res.result as { files: { filename: string; size: number; createdAt: string }[] };
      const formattedFiles = files.map(file => ({
        name: file.filename,
        size: formatters.bytes(file.size),
        createdAt: formatters.date(new Date(file?.createdAt)),
      }));
      const mountableFiles = formattedFiles.filter(f => isMountableVirtualMediaFile(f.name));
      setStorageFiles(mountableFiles);
      setSelectedFile(prev => (prev && mountableFiles.some(f => f.name === prev) ? prev : null));
    });

    send(getSpaceApi, {}, res => {
      if ("error" in res) {
        notifications.error(`Error getting storage space: ${res.error}`);
        return;
      }
      setStorageSpace(res.result as StorageSpace);
    });

    if (showAutoMount && getAutoMountApi) {
      send(getAutoMountApi, {}, resp => {
        if ("error" in resp) {
          notifications.error(`Failed to load auto mount system_info.img: ${resp.error.data || "Unknown error"}`);
          setAutoMountSystemInfo(false);
        } else {
          setAutoMountSystemInfo(resp.result as boolean);
        }
      });
    }
  }, [send, listFilesApi, getSpaceApi, showAutoMount, getAutoMountApi, storageType, sdMountStatus]);

  useEffect(() => {
    if (storageType === 'sd') {
      checkSDStatus();
    } else {
      syncStorage();
    }
  }, [checkSDStatus, storageType, syncStorage]);

  useEffect(() => {
    if (sdMountStatus === 'ok') {
      syncStorage();
    }
  }, [sdMountStatus, syncStorage]);

  const handleDeleteFile = useCallback((file: StorageFile) => {
    if (window.confirm($at("Are you sure you want to delete " + file.name + "?"))) {
      send(deleteFileApi, { filename: file.name }, res => {
        if ("error" in res) {
          notifications.error(`Error deleting file: ${res.error}`);
          return;
        }
        syncStorage();
      });
    }
  }, [send, deleteFileApi, syncStorage, $at]);

  const handleSelectFile = useCallback((file: StorageFile) => {
    setSelectedFile(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".iso")) {
      setUsbMode("CDROM");
    } else if (lower.endsWith(".img")) {
      setUsbMode("Disk");
    }
  }, []);
  const syncRemoteVirtualMediaState = useCallback(() => {
    send("getVirtualMediaState", {}, response => {
      if ("error" in response) {
        notifications.error(
          `Failed to get virtual media state: ${response.error.message}`,
        );
      } else {
        setRemoteVirtualMediaState(response.result as unknown as RemoteVirtualMediaState);
      }
    });
  }, [send, setRemoteVirtualMediaState]);
  const handleMountFile = useCallback(() => {
    if (!selectedFile) return;

    setMountInProgress(true);
    send(mountApi, { filename: selectedFile, mode: usbMode }, async resp => {
      if ("error" in resp) {
        notifications.error(`Mount error: ${resp.error.message}`);
        setMountInProgress(false);
        return;
      }

      syncRemoteVirtualMediaState()
      setMountInProgress(false);
      if (onMountSuccess) {
        onMountSuccess();
      } else {
        navigate("..");
      }
    });
  }, [selectedFile, usbMode, send, mountApi, onMountSuccess, navigate]);

  const handleAutoMountSystemInfoChange = useCallback((value: boolean) => {
    if (!setAutoMountApi) return;

    send(setAutoMountApi, { enabled: value }, response => {
      if ("error" in response) {
        notifications.error(`Failed to set auto mount system_info.img: ${response.error.message}`);
        return;
      }
      setAutoMountSystemInfo(value);
    });
  }, [send, setAutoMountApi]);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const handleFileUploadComplete = useCallback(() => {
    syncStorage();
  }, [syncStorage]);

  if (storageType === 'sd' && sdMountStatus && sdMountStatus !== "ok") {
    return (
      <div className="w-full space-y-6 px-0.5">
        <ViewHeader
          title={$at("KVM MicroSD Card Mount")}
          description={$at("Manage and mount images from MicroSD card")}
        />
        <div className="relative">
          <Card>
            <div className="p-8 text-center">
              <div className="space-y-2">
                <OnSDCardSvg className="mx-auto h-[24px] w-[24px]" />
                <div className="space-y-2">
                  <div className={"flex justify-center gap-3 pt-4"}>
                    <h3 className="text-lg font-semibold text-black dark:text-white">
                      {sdMountStatus === "none"
                        ? $at("No SD Card Detected")
                        : $at("SD Card Mount Failed")}
                    </h3>
                    <div className={`w-[24px] h-[24px] border ${dark_bd_style} p-[5px] ${dark_bg_desktop} flex items-center justify-center cursor-pointer`}
                         onClick={handleResetSDStorage}>
                      <RefreshSvg className={`h-[12px] w-[12px] ${dark_font_style}`} />
                    </div>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">
                    {sdMountStatus === "none"
                      ? $at("Please insert an SD card and try again.")
                      : $at("Please format the SD card and try again.")}
                  </p>
                  {sdMountStatus !== "none" && (
                    <div className="pt-2">
                      <div className="mx-auto w-full max-w-[360px] space-y-2">
                        <p className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                          {$at("Choose the file system for MicroSD formatting")}
                        </p>
                        <select
                          value={fsType}
                          onChange={(e) => setFsType(e.target.value as 'exfat' | 'fat32')}
                          style={{ width: "100%", padding: "8px", borderRadius: "4px" }}
                        >
                          <option value="fat32">FAT32</option>
                          <option value="exfat">exFAT</option>
                        </select>
                        <AntdButton
                          disabled={loading}
                          danger={true}
                          type="primary"
                          onClick={handleFormatSDStorage}
                          className="w-full text-red-500 dark:text-red-400 border-red-200 dark:border-red-800"
                        >
                          {$at("Format MicroSD Card")} ({fsType})
                        </AntdButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          {loading && <LoadingOverlay />}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full space-y-6 px-0.5 ${isMobile?"mb-11":""}`}>
      <ViewHeader
        title={$at("Mount from KVM Storage")}
        description={$at("Select the image you want to mount from the KVM storage")}
      />
      {showAutoMount && (
        <div className="w-full animate-fadeIn opacity-0" style={{ animationDuration: "0.7s", animationDelay: "0.1s" }}>
          <SettingsItem
            title={$at(autoMountTitle)}
            description={$at(autoMountDescription)}
            noCol
          >
            <Checkbox
              checked={autoMountSystemInfo}
              onChange={(e) => handleAutoMountSystemInfoChange(e.target.checked)}
            />
          </SettingsItem>
        </div>
      )}

      {showAutoMount && <hr className="border-slate-800/20 dark:border-slate-300/20" />}

      <div className="w-full animate-fadeIn opacity-0 px-0.5" style={{ animationDuration: "0.7s", animationDelay: "0.1s" }}>
        <div className="relative">
          <Card>
            {storageFiles.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <PlusCircleIcon className={`mx-auto h-6 w-6 ${text_primary_color}`} />
                    <h3 className="text-sm leading-none font-semibold text-black dark:text-white">
                      {$at("No images available")}
                    </h3>
                    <p className="text-xs leading-none text-slate-700 dark:text-slate-300">
                      {$at("Upload an image to start virtual media mounting.")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full divide-y divide-slate-800/20 dark:divide-slate-300/20">
                {currentFiles.map((file, index) => (
                  <PreUploadedImageItem
                    key={index}
                    name={file.name}
                    size={file.size}
                    uploadedAt={file.createdAt}
                    isIncomplete={file.name.endsWith(".incomplete")}
                    isSelected={selectedFile === file.name}
                    onDelete={() => handleDeleteFile(file)}
                    onSelected={() => handleSelectFile(file)}
                    onDownload={() => undefined}
                    onContinueUpload={() => {
                      if (onNewImageClick) {
                        onNewImageClick(file.name);
                      } else {
                        setUploadFile(file.name);
                      }
                    }}
                  />
                ))}

                {storageFiles.length > filesPerPage && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {$at("Showing")} <span className="font-bold">{((currentPage - 1) * filesPerPage) + 1}</span> {""}
                      {$at("to")} <span className="font-bold">
                        {Math.min(currentPage * filesPerPage, storageFiles.length)}
                      </span> {""}
                      {$at("of")} <span className="font-bold">{storageFiles.length}</span> {""}
                      {$at("results")}
                    </p>
                    <div className="flex items-center gap-x-2">
                      <Button
                        size="XS"
                        theme="light"
                        text={$at("Previous")}
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                      />
                      <Button
                        size="XS"
                        theme="light"
                        text={$at("Next")}
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
          {loading && <LoadingOverlay />}
        </div>
      </div>

      {storageFiles.length > 0 && (
        <div className="flex animate-fadeIn items-end justify-between opacity-0" style={{ animationDuration: "0.7s", animationDelay: "0.15s" }}>
          <Fieldset disabled={selectedFile === null}>
            <UsbModeSelector usbMode={usbMode} setUsbMode={setUsbMode} />
          </Fieldset>
          <div className="flex items-center gap-x-2">
            
            <AntdButton
              disabled={selectedFile === null || mountInProgress}
              type="primary"
              loading={mountInProgress}
              onClick={handleMountFile}
            >{$at("Mount")}</AntdButton>
          </div>
        </div>
      )}

      <hr className="border-slate-800/20 dark:border-slate-300/20" />
      <div className="animate-fadeIn space-y-2 opacity-0" style={{ animationDuration: "0.7s", animationDelay: "0.20s" }}>
        <StorageSpaceBar
          percentageUsed={percentageUsed}
          bytesUsed={storageSpace?.bytesUsed || 0}
          bytesFree={storageSpace?.bytesFree || 0}
        />
      </div>

      {unmountApi && storageType === 'sd' && (
        <div className="animate-fadeIn space-y-2 opacity-0"
             style={{ animationDuration: "0.7s", animationDelay: "0.25s" }}
        >
          <div className="w-full space-y-2">
            <p className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              {$at("Choose the file system for MicroSD formatting")}
            </p>
            <select
              value={fsType}
              onChange={(e) => setFsType(e.target.value as 'exfat' | 'fat32')}
              style={{ width: "100%", padding: "8px", borderRadius: "4px" }}
            >
              <option value="fat32">FAT32</option>
              <option value="exfat">exFAT</option>
            </select>
            <AntdButton
              disabled={loading}
              type="primary"
              danger={true}
              onClick={handleFormatSDStorage}
              className="w-full text-red-500 dark:text-red-400 border-red-200 dark:border-red-800"
            >{$at("Format MicroSD Card")} ({fsType})</AntdButton>
          </div>
          <AntdButton
            disabled={loading}
            type="primary"
            danger={true}
            onClick={handleUnmountSDStorage}
            className="w-full text-red-500 dark:text-red-400 border-red-200 dark:border-red-800"
          >{$at("Unmount MicroSD Card")}</AntdButton>
        </div>
      )}
      {customActions}

      {uploadFile ? (
        <FileUploader
          key={`resume-${uploadFile}`}
          onBack={() => {
            setUploadFile(null);
            handleFileUploadComplete();
          }}
          incompleteFileName={uploadFile}
          media={storageType}
          accept=".img,.iso"
        />
      ) : (
        <FileUploader
          key="new-upload"
          onBack={handleFileUploadComplete}
          media={storageType}
          accept=".img,.iso"
        />
      )}

    </div>
  );
}
