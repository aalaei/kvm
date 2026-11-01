import { FileManager } from "@/layout/components_side/SharedFolders/FileManager";

export default function DeviceFilePage() {
  return (
    <FileManager
      mediaType="local"
      returnTo="/device-files"
      listFilesMethod="listStorageFiles"
      getSpaceMethod="getStorageSpace"
      deleteFileMethod="deleteStorageFile"
      downloadUrlPrefix="/storage/download"
    />
  );
}