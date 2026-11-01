import { useCallback, useEffect, useRef } from "react";

import notifications from "@/notifications";
import { useHidStore, useRTCStore, useSettingsStore } from "@/hooks/stores";
import { useJsonRpc } from "@/hooks/useJsonRpc";
import { keys, modifiers } from "@/keyboardMappings";

export default function useKeyboard() {
  const [send] = useJsonRpc();

  const rpcDataChannel = useRTCStore(state => state.rpcDataChannel);
  const forceHttp = useSettingsStore(state => state.forceHttp);
  const updateActiveKeysAndModifiers = useHidStore(
    state => state.updateActiveKeysAndModifiers,
  );
  const isReinitializingGadget = useHidStore(state => state.isReinitializingGadget);
  const usbState = useHidStore(state => state.usbState);

  // Track held keys for keepalive
  const heldKeysRef = useRef<Set<number>>(new Set());
  const keepaliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendKeyboardEvent = useCallback(
    (keys: number[], modifiers: number[]) => {
      if (!forceHttp && rpcDataChannel?.readyState !== "open") return;
      // Don't send keyboard events while reinitializing gadget
      if (isReinitializingGadget) return;
      if (usbState !== "configured") return;
      const accModifier = modifiers.reduce((acc, val) => acc + val, 0);

      // Fallback to JSON-RPC
      send("keyboardReport", { keys, modifier: accModifier }, resp => {
        if ("error" in resp) {
          const msg = (resp.error.data as string) || resp.error.message || "";
          if (msg.includes("cannot send after transport endpoint shutdown") && usbState === "configured") {
            notifications.error("Please check if the cable and connection are stable.", { duration: 5000 });
          }
        }
      });

      // We do this for the info bar to display the currently pressed keys for the user
      updateActiveKeysAndModifiers({ keys: keys, modifiers: modifiers });
    },
    [forceHttp, rpcDataChannel?.readyState, send, updateActiveKeysAndModifiers, isReinitializingGadget, usbState],
  );

  // Send per-key press/release
  const sendKeypress = useCallback(
    (key: number, press: boolean) => {
      if (isReinitializingGadget || usbState !== "configured") return;

      // Legacy: simulate device-side key handling
      // This maintains the 6-key buffer on the frontend for legacy compatibility
      // For simplicity in migration, we fall back to full state reports
      const modifier = press ? 0 : 0; // Simplified - would need proper modifier tracking
      sendKeyboardEvent(press ? [key] : [], [modifier]);
    },
    [isReinitializingGadget, usbState, sendKeyboardEvent]
  );

  const resetKeyboardState = useCallback(() => {
    // Release all held keys
    sendKeyboardEvent([], []);
    heldKeysRef.current.clear();
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
  }, [sendKeyboardEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetKeyboardState();
    };
  }, [resetKeyboardState]);

  const executeMacro = async (steps: { keys: string[] | null; modifiers: string[] | null; delay: number }[]) => {
    for (const [index, step] of steps.entries()) {
      const keyValues = step.keys?.map(key => keys[key]).filter(Boolean) || [];
      const modifierValues = step.modifiers?.map(mod => modifiers[mod]).filter(Boolean) || [];

      // If the step has keys and/or modifiers, press them and hold for the delay
      if (keyValues.length > 0 || modifierValues.length > 0) {
        sendKeyboardEvent(keyValues, modifierValues);
        await new Promise(resolve => setTimeout(resolve, step.delay || 50));

        resetKeyboardState();
      } else {
        // This is a delay-only step, just wait for the delay amount
        await new Promise(resolve => setTimeout(resolve, step.delay || 50));
      }

      // Add a small pause between steps if not the last step
      if (index < steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  };

  return { sendKeyboardEvent, sendKeypress, resetKeyboardState, executeMacro };
}
