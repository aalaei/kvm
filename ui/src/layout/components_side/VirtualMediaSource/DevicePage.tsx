import ImageManager from "@/layout/components_side/VirtualMediaSource/ImageManager";

export default function DeviceFileView() {
  return (
    <ImageManager
      storageType="kvm"
      listFilesApi="listStorageFiles"
      getSpaceApi="getStorageSpace"
      deleteFileApi="deleteStorageFile"
      mountApi="mountWithStorage"
    />
  );
}
