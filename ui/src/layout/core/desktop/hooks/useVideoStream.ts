import { useCallback, useEffect, useState, useRef } from "react";
import { useResizeObserver } from "usehooks-ts";
import JMuxer from "jmuxer";

import { useRTCStore, useVideoStore, useSettingsStore } from "@/hooks/stores";

export const useVideoStream = (
  videoElm: React.RefObject<HTMLVideoElement>,
  audioElm: React.RefObject<HTMLAudioElement>
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaStream = useRTCStore(state => state.mediaStream);
  const peerConnectionState = useRTCStore(state => state.peerConnectionState);
  const setPeerConnectionState = useRTCStore(state => state.setPeerConnectionState);
  const forceHttp = useSettingsStore(state => state.forceHttp);
  const { setClientSize: setVideoClientSize, setSize: setVideoSize } = useVideoStore();
  const jmuxerRef = useRef<any>(null);

  const updateVideoSizeStore = useCallback((videoElm: HTMLVideoElement) => {
    setVideoClientSize(videoElm.clientWidth, videoElm.clientHeight);
    setVideoSize(videoElm.videoWidth, videoElm.videoHeight);
  }, [setVideoClientSize, setVideoSize]);

  const markAsPlaying = useCallback(() => {
    setIsPlaying(true);
    if (videoElm.current) {
      updateVideoSizeStore(videoElm.current);
    }
  }, [updateVideoSizeStore, videoElm]);

  const onVideoPlaying = useCallback(() => {
    markAsPlaying();
  }, [markAsPlaying]);

  const handlePlayClick = useCallback(() => {
    videoElm.current?.play();
  }, [videoElm]);

  const videoKeyUpHandler = useCallback((e: KeyboardEvent) => {
    if (!videoElm.current) return;
    if (e.code === "Space" && videoElm.current.paused) {
      videoElm.current.play();
    }
  }, [videoElm]);

  useResizeObserver({
    ref: videoElm as React.RefObject<HTMLElement>,
    onResize: ({ width, height }) => {
      if (width && height && videoElm.current) {
        updateVideoSizeStore(videoElm.current);
      }
    },
  });

  const addStreamToVideoElm = useCallback((mediaStream: MediaStream) => {
    if (!videoElm.current) return;
    videoElm.current.srcObject = mediaStream;
    updateVideoSizeStore(videoElm.current);
  }, [updateVideoSizeStore, videoElm]);

  const addStreamToAudioElm = useCallback((mediaStream: MediaStream) => {
    if (!audioElm.current) return;
    audioElm.current.srcObject = mediaStream;
  }, [audioElm]);

  const setupVideoEventListeners = useCallback(() => {
    const videoElmRefValue = videoElm.current;
    if (!videoElmRefValue) return;

    const abortController = new AbortController();
    const signal = abortController.signal;

    videoElmRefValue.addEventListener("keyup", videoKeyUpHandler, { signal });
    videoElmRefValue.addEventListener("playing", onVideoPlaying, { signal });
    videoElmRefValue.addEventListener("play", onVideoPlaying, { signal });

    return () => abortController.abort();
  }, [onVideoPlaying, videoKeyUpHandler, videoElm]);

  useEffect(() => {
    if (videoElm.current) updateVideoSizeStore(videoElm.current);
  }, [updateVideoSizeStore]);

  useEffect(() => {
    if (!mediaStream || forceHttp) {
      if (forceHttp) {
        if (videoElm.current?.srcObject) {
          videoElm.current.srcObject = null;
        }
        if (audioElm.current?.srcObject) {
          audioElm.current.srcObject = null;
        }
      }
      return;
    }
    addStreamToVideoElm(mediaStream);
    addStreamToAudioElm(mediaStream);
  }, [mediaStream, addStreamToVideoElm, addStreamToAudioElm, forceHttp, videoElm, audioElm]);

  useEffect(() => {
    if (forceHttp && videoElm.current) {
      console.log('[forceHttp] Setting up HTTP video stream');

      if (jmuxerRef.current) {
        console.log('[forceHttp] Destroying previous JMuxer instance');
        jmuxerRef.current.destroy();
        jmuxerRef.current = null;
      }

      if (videoElm.current.srcObject) {
        console.log('[forceHttp] Clearing video srcObject');
        videoElm.current.srcObject = null;
      }
      if (audioElm.current?.srcObject) {
        console.log('[forceHttp] Clearing audio srcObject');
        audioElm.current.srcObject = null;
      }

      console.log('[forceHttp] Creating new JMuxer instance');
      jmuxerRef.current = new JMuxer({
        node: videoElm.current,
        mode: 'video',
        flushingTime: 0,
        fps: 60,
        debug: false
      });
      console.log('[forceHttp] JMuxer instance created:', jmuxerRef.current);

      markAsPlaying();
      setPeerConnectionState("connecting");

      const controller = new AbortController();
      const signal = controller.signal;
      const hasReceivedDataRef = { current: false };
      const lastDataAtRef = { current: Date.now() };
      const watchdogInterval = setInterval(() => {
        if (!hasReceivedDataRef.current) return;
        const msSinceLastData = Date.now() - lastDataAtRef.current;
        if (msSinceLastData <= 10000) return;
        console.error('[forceHttp] Stream watchdog triggered (no data for 10 seconds)');
        setPeerConnectionState("failed");
        controller.abort();
      }, 1000);

      const fetchStream = async () => {
        try {
          console.log('[forceHttp] Starting fetch to /video/stream');
          
          console.log('[forceHttp] Creating fetch promise with timeout');
          const fetchPromise = fetch('/video/stream', { signal }).catch(err => {
            console.error('[forceHttp] Fetch promise rejected:', err);
            throw err;
          });
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Fetch timeout after 5 seconds'));
            }, 5000);
          });
          
          console.log('[forceHttp] Racing fetch and timeout promises');
          let response: Response;
          try {
            response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
            console.log('[forceHttp] Promise race completed, got response');
          } catch (err: any) {
            console.error('[forceHttp] Promise race failed:', {
              name: err?.name,
              message: err?.message,
              stack: err?.stack
            });
            throw err;
          }
          
          console.log('[forceHttp] Response received:', response.status, response.statusText, {
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            bodyUsed: response.bodyUsed,
            body: response.body ? 'present' : 'null'
          });
          
          if (!response.ok) {
            console.error('[forceHttp] Response not OK:', response.status, response.statusText);
            const text = await response.text();
            console.error('[forceHttp] Response body:', text);
            setPeerConnectionState("failed");
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            console.error('[forceHttp] No reader available from response body');
            setPeerConnectionState("failed");
            return;
          }

          console.log('[forceHttp] Reader obtained, starting to read frames');

          let frameCount = 0;
          const startTime = Date.now();
          let lastFrameTime = Date.now();
          let lastDataTime = Date.now();

          while (true) {
            try {
              const now = Date.now();
              if (frameCount > 0 && now - lastDataTime > 10000) {
                console.error('[forceHttp] No data received for 10 seconds. Last frame was', frameCount, 'time since last data:', now - lastDataTime, 'ms');
                lastDataTime = now;
              }

              const { done, value } = await reader.read();

              if (done) {
                console.log('[forceHttp] Stream ended, total frames:', frameCount, 'duration:', Date.now() - startTime, 'ms');
                setPeerConnectionState("failed");
                break;
              }

              if (value) {
                lastDataTime = Date.now();
                lastDataAtRef.current = lastDataTime;
                const timeSinceLastFrame = lastDataTime - lastFrameTime;
                lastFrameTime = lastDataTime;

                frameCount++;
                if (frameCount === 1) {
                  hasReceivedDataRef.current = true;
                  console.log('[forceHttp] First frame received, size:', value.length, 'time since start:', lastDataTime - startTime, 'ms');
                  setPeerConnectionState("connected");
                }
                //if (frameCount % 60 === 0) {
                //  console.log('[forceHttp] Received frames:', frameCount, 'latest size:', value.length, 'elapsed:', lastDataTime - startTime, 'ms', 'time since last frame:', timeSinceLastFrame, 'ms');
                //}
                if (jmuxerRef.current) {
                  jmuxerRef.current.feed({
                    video: value
                  });
                } else {
                  console.warn('[forceHttp] JMuxer not available when trying to feed frame', frameCount);
                }
              }
            } catch (readError: any) {
              console.error('[forceHttp] Error reading from stream:', readError);
              setPeerConnectionState("failed");
              break;
            }
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('[forceHttp] Error fetching video stream:', {
              name: error.name,
              message: error.message,
              stack: error.stack,
              cause: error.cause
            });
            setPeerConnectionState("failed");
          } else {
            console.log('[forceHttp] Fetch aborted (normal cleanup)');
          }
        }
      };

      fetchStream();

      return () => {
        clearInterval(watchdogInterval);
        controller.abort();
        if (jmuxerRef.current) {
          jmuxerRef.current.destroy();
          jmuxerRef.current = null;
        }
      };
    }
  }, [forceHttp, videoElm, audioElm, markAsPlaying, setPeerConnectionState]);

  return {
    isPlaying,
    peerConnectionState,
    onVideoPlaying,
    handlePlayClick,
    setupVideoEventListeners,
  };
};
