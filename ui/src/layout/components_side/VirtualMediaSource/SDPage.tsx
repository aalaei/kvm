import { isMobile } from "react-device-detect";

import ImageManager from "@/layout/components_side/VirtualMediaSource/ImageManager";

export default function SDPage() {
  const customActions = (
    <div className="grid grid-cols-2 gap-4">
      {isMobile&&<div className="h-[30px]"></div>}
    </div>
  );

  return (
    <ImageManager
      storageType="sd"
      listFilesApi="listSDStorageFiles"
      getSpaceApi="getSDStorageSpace"
      deleteFileApi="deleteSDStorageFile"
      mountApi="mountWithSDStorage"
      unmountApi="unmountSDStorage"
      customActions={customActions}
    />
  );
}