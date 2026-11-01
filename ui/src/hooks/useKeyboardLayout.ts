import { useMemo } from "react";

import { useSettingsStore } from "@/hooks/stores";
import { keyboards } from "@/keyboardLayouts";

export default function useKeyboardLayout() {
  const { keyboardLayout } = useSettingsStore();

  const keyboardOptions = useMemo(() => {
    return keyboards.map(keyboard => {
      return { label: keyboard.name, value: keyboard.isoCode };
    });
  }, []);

  const isoCode = useMemo(() => {
    if (keyboardLayout && keyboardLayout.length > 0)
      return keyboardLayout.replace("en_US", "en-US");
    return "en-US";
  }, [keyboardLayout]);

  const selectedKeyboard = useMemo(() => {
    return (
      keyboards.find(keyboard => keyboard.isoCode === isoCode) ??
      keyboards.find(keyboard => keyboard.isoCode === "en-US")!
    );
  }, [isoCode]);

  return { keyboardOptions, isoCode, selectedKeyboard };
}