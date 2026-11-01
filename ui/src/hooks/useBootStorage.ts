import { useEffect, useState } from "react";
import { useJsonRpc } from "./useJsonRpc";
import { useBootStorageStore, BootStorageType } from "./stores";

export const useBootStorageType = () => {
  const [send] = useJsonRpc();
  const bootStorageType = useBootStorageStore(state => state.bootStorageType);
  const setBootStorageType = useBootStorageStore(state => state.setBootStorageType);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bootStorageType !== "unknown") {
      setLoading(false);
      return;
    }

    send("getBootStorageType", {}, res => {
      setLoading(false);
      if ("error" in res) {
        console.error("Failed to get boot storage type:", res.error);
        setBootStorageType("unknown");
        return;
      }
      const { type } = res.result as { type: BootStorageType };
      setBootStorageType(type);
    });
  }, [send, bootStorageType, setBootStorageType]);

  return { bootStorageType, loading };
};
