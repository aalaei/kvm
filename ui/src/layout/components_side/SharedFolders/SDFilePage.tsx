import { useState } from "react";
import { useReactAt } from "i18n-auto-extractor/react";

import { FileManager } from "@/layout/components_side/SharedFolders/FileManager";
import notifications from "@/notifications";
import { useJsonRpc } from "@/hooks/useJsonRpc";

export default function SDFilePage() {
  const { $at } = useReactAt();
  const [send] = useJsonRpc();
  const [loading, setLoading] = useState(false);
  const [fsType, setFsType] = useState<'exfat' | 'fat32'>('fat32');

  const handleResetSDStorage = async () => {
    setLoading(true);
    send("resetSDStorage", {}, res => {
      if ("error" in res) {
        notifications.error(`Failed to reset SD card`);
        setLoading(false);
        return;
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  const handleUnmountSDStorage = async () => {
    setLoading(true);
    send("unmountSDStorage", {}, res => {
      if ("error" in res) {
        notifications.error(`Failed to unmount SD card`);
        setLoading(false);
        return;
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  const handleFormatSDStorage = async () => {
    if (!window.confirm($at(`Formatting the SD card as ${fsType.toUpperCase()} will erase all data. Continue?`))) {
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
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
  };

  return (
    <>
      <FileManager
        mediaType="sd"
        returnTo="/sd-files"
        listFilesMethod="listSDStorageFiles"
        getSpaceMethod="getSDStorageSpace"
        deleteFileMethod="deleteSDStorageFile"
        downloadUrlPrefix="/storage/sd-download"
        showSDManagement={true}
        onResetSDStorage={handleResetSDStorage}
        onUnmountSDStorage={handleUnmountSDStorage}
        onFormatSDStorage={handleFormatSDStorage}
        fsType={fsType}
        onFsTypeChange={setFsType}
      />
    </>
  );
}
