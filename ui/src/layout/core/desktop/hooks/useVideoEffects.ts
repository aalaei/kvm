import { useSettingsStore } from "@/hooks/stores";

export const useVideoEffects = () => {
  const settings = useSettingsStore();

  const videoSaturation = useSettingsStore(state => state.videoSaturation);
  const videoBrightness = useSettingsStore(state => state.videoBrightness);
  const videoContrast = useSettingsStore(state => state.videoContrast);

  const videoStyle = {
    filter: `saturate(${videoSaturation}) brightness(${videoBrightness}) contrast(${videoContrast})`,
  };

  return {
    settings,
    videoStyle,
    videoSaturation,
    videoBrightness,
    videoContrast,
  };
};