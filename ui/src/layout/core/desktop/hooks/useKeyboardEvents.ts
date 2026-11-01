import { useCallback } from "react";

import  useKeyboard  from "@/hooks/useKeyboard";
import { useHidStore, useSettingsStore, useUiStore } from "@/hooks/stores";
import { keys, modifiers } from "@/keyboardMappings";
import { keyboards } from "@/keyboardLayouts";
import { eventMatchesShortcut } from "@/utils/shortcuts";

export const useKeyboardEvents = (
  pasteCaptureRef?: React.RefObject<HTMLTextAreaElement>,
  isReinitializingGadget?: boolean
) => {
  const { sendKeyboardEvent, resetKeyboardState } = useKeyboard();
  const { setIsNumLockActive, setIsCapsLockActive, setIsScrollLockActive } = useHidStore();

  const keyboardLedStateSyncAvailable = useHidStore(state => state.keyboardLedStateSyncAvailable);
  const keyboardLedSync = useSettingsStore(state => state.keyboardLedSync);
  const isKeyboardLedManagedByHost = keyboardLedSync !== "browser" && keyboardLedStateSyncAvailable;
  const pasteShortcutEnabled = useSettingsStore(state => state.pasteShortcutEnabled);
  const pasteShortcut = useSettingsStore(state => state.pasteShortcut);
  const isOcrMode = useUiStore(state => state.isOcrMode);
  const keyboardLayout = useSettingsStore(state => state.keyboardLayout);

  const remapCode = useCallback((code: string, key: string): string => {
    const modifierCodes = ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock", "Tab", "Enter", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "PrintScreen", "ScrollLock", "Pause", "ContextMenu", "Menu"];
    if (modifierCodes.includes(code)) return code;
    if (code.startsWith("Digit") || code.startsWith("Numpad")) return code;
    if (code.startsWith("Key") && code.length === 4) {
      const letter = code.charAt(3);
      if (letter >= "A" && letter <= "Z") {
        const isoCode = (keyboardLayout || "en-US").replace("_", "-");
        const layout = keyboards.find(k => k.isoCode === isoCode);
        if (layout && layout.chars) {
          const charLower = key.toLowerCase();
          const charEntry = layout.chars[charLower] || layout.chars[key];
          if (charEntry && charEntry.key && typeof charEntry.key === "string" && charEntry.key !== code) {
            return charEntry.key;
          }
        }
      }
    }
    return code;
  }, [keyboardLayout]);

  const handleModifierKeys = useCallback((e: KeyboardEvent, activeModifiers: number[]) => {
    const { shiftKey, ctrlKey, altKey, metaKey } = e;
    const filteredModifiers = activeModifiers.filter(Boolean);

    return filteredModifiers
      .filter(modifier => shiftKey || (modifier !== modifiers["ShiftLeft"] && modifier !== modifiers["ShiftRight"]))
      .filter(modifier => ctrlKey || (modifier !== modifiers["ControlLeft"] && modifier !== modifiers["ControlRight"]))
      .filter(modifier => altKey || modifier !== modifiers["AltLeft"])
      .filter(modifier => metaKey || (modifier !== modifiers["MetaLeft"] && modifier !== modifiers["MetaRight"]));
  }, []);

  const keyDownHandler = useCallback(async (e: KeyboardEvent) => {
    if (isOcrMode) return;
    if (pasteShortcutEnabled && eventMatchesShortcut(e, pasteShortcut)) {
      if (isReinitializingGadget) return;
      if (pasteCaptureRef && pasteCaptureRef.current) {
        pasteCaptureRef.current.value = "";
        pasteCaptureRef.current.focus();
      }
      return;
    }
    if (isReinitializingGadget) return;

    if (e.repeat) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    const prev = useHidStore.getState();
    let code = e.code;
    const key = e.key;

    if (!isKeyboardLedManagedByHost) {
      setIsNumLockActive(e.getModifierState("NumLock"));
      setIsCapsLockActive(e.getModifierState("CapsLock"));
      setIsScrollLockActive(e.getModifierState("ScrollLock"));
    }

    if (code == "IntlBackslash" && ["`", "~"].includes(key)) {
      code = "Backquote";
    } else if (code == "Backquote" && ["§", "±"].includes(key)) {
      code = "IntlBackslash";
    }

    code = remapCode(code, key);

    const newKeys = [...prev.activeKeys, keys[code]].filter(Boolean);
    const newModifiers = handleModifierKeys(e, [...prev.activeModifiers, modifiers[code]]);

    if (e.metaKey) {
      setTimeout(() => {
        const prev = useHidStore.getState();
        sendKeyboardEvent([], newModifiers || prev.activeModifiers);
      }, 10);
    }

    sendKeyboardEvent([...new Set(newKeys)], [...new Set(newModifiers)]);
  }, [handleModifierKeys, remapCode, sendKeyboardEvent, isKeyboardLedManagedByHost, setIsNumLockActive, setIsCapsLockActive, setIsScrollLockActive, pasteShortcutEnabled, pasteShortcut, pasteCaptureRef, isReinitializingGadget, isOcrMode]);

  const keyUpHandler = useCallback((e: KeyboardEvent) => {
    if (isOcrMode) return;
    if (isReinitializingGadget) return;
    e.preventDefault();
    const prev = useHidStore.getState();
    const key = e.key;
    let code = remapCode(e.code, key);

    if (!isKeyboardLedManagedByHost) {
      setIsNumLockActive(e.getModifierState("NumLock"));
      setIsCapsLockActive(e.getModifierState("CapsLock"));
      setIsScrollLockActive(e.getModifierState("ScrollLock"));
    }

    const newKeys = prev.activeKeys.filter(k => k !== keys[code]).filter(Boolean);
    const newModifiers = handleModifierKeys(
      e,
      prev.activeModifiers.filter(k => k !== modifiers[code]),
    );

    sendKeyboardEvent([...new Set(newKeys)], [...new Set(newModifiers)]);
  }, [handleModifierKeys, remapCode, sendKeyboardEvent, isKeyboardLedManagedByHost, setIsNumLockActive, setIsCapsLockActive, setIsScrollLockActive, isOcrMode, isReinitializingGadget]);

  const setupKeyboardEvents = useCallback(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    document.addEventListener("keydown", keyDownHandler, { signal });
    document.addEventListener("keyup", keyUpHandler, { signal });
    window.addEventListener("blur", resetKeyboardState, { signal });
    document.addEventListener("visibilitychange", resetKeyboardState, { signal });

    return () => abortController.abort();
  }, [keyDownHandler, keyUpHandler, resetKeyboardState]);

  return {
    setupKeyboardEvents,
  };
};
