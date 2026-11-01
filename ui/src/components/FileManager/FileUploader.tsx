import { useReactAt } from "i18n-auto-extractor/react";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuUpload } from "react-icons/lu";
import { isMobile } from "react-device-detect";

import { useJsonRpc } from "@/hooks/useJsonRpc";
import { useRTCStore } from "@/hooks/stores";
import notifications from "@/notifications";
import { DEVICE_API } from "@/ui.config";
import { isOnDevice } from "@/main";
import Card from "@components/Card";
import { cx } from "@/cva.config";
import { formatters } from "@/utils";
import { text_primary_color } from "@/layout/theme_color";

import UploadSvg from "@/assets/second/upload.svg?react";


export function FileUploader({
                              onBack,
                              incompleteFileName,
                              media,
                              accept,
                             }: {
  onBack: () => void;
  incompleteFileName?: string;
  media?: string;
  accept?: string;
})
{
  const { $at }= useReactAt();
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success">(
    "idle",
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [send] = useJsonRpc();
  const rtcDataChannelRef = useRef<RTCDataChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const validateSelectedFile = (file: File) => {
    if (!accept) return null;
    const allowedExts = accept
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(s => s.startsWith("."));
    if (allowedExts.length === 0) return null;
    const lowerName = file.name.toLowerCase();
    if (allowedExts.some(ext => lowerName.endsWith(ext))) return null;
    return $at("Only {{types}} files are supported").replace(
      "{{types}}",
      allowedExts.join(", "),
    );
  };

  useEffect(() => {
    const ref = rtcDataChannelRef.current;
    return () => {
      if (ref) {
        ref.onopen = null;
        ref.onerror = null;
        ref.onmessage = null;
        ref.onclose = null;
        ref.close();
      }
      if (xhrRef.current) {
        xhrRef.current.abort();
      }
    };
  }, []);

  function handleWebRTCUpload(
    file: File,
    alreadyUploadedBytes: number,
    dataChannel: string,
  ) {
    const rtcDataChannel = useRTCStore
      .getState()
      .peerConnection?.createDataChannel(dataChannel);

    if (!rtcDataChannel) {
      console.error("Failed to create data channel for file upload");
      notifications.error("Failed to create data channel for file upload");
      setUploadState("idle");
      console.log("Upload state set to 'idle'");

      return;
    }

    rtcDataChannelRef.current = rtcDataChannel;

    const lowWaterMark = 256 * 1024;
    const highWaterMark = 1 * 1024 * 1024;
    rtcDataChannel.bufferedAmountLowThreshold = lowWaterMark;

    let lastUploadedBytes = alreadyUploadedBytes;
    let lastUpdateTime = Date.now();
    const speedHistory: number[] = [];

    rtcDataChannel.onmessage = e => {
      try {
        const { AlreadyUploadedBytes, Size } = JSON.parse(e.data) as {
          AlreadyUploadedBytes: number;
          Size: number;
        };

        const now = Date.now();
        const timeDiff = (now - lastUpdateTime) / 1000; // in seconds
        const bytesDiff = AlreadyUploadedBytes - lastUploadedBytes;

        if (timeDiff > 0) {
          const instantSpeed = bytesDiff / timeDiff; // bytes per second

          // Add to speed history, keeping last 5 readings
          speedHistory.push(instantSpeed);
          if (speedHistory.length > 5) {
            speedHistory.shift();
          }

          // Calculate average speed
          const averageSpeed =
            speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;

          setUploadSpeed(averageSpeed);
          setUploadProgress((AlreadyUploadedBytes / Size) * 100);
        }

        lastUploadedBytes = AlreadyUploadedBytes;
        lastUpdateTime = now;
      } catch (e) {
        console.error("Error processing RTC Data channel message:", e);
      }
    };

    rtcDataChannel.onopen = () => {
      let pauseSending = false; // Pause sending when the buffered amount is high
      const chunkSize = 4 * 1024; // 4KB chunks

      let offset = alreadyUploadedBytes;
      const sendNextChunk = () => {
        if (offset >= file.size) {
          rtcDataChannel.close();
          setUploadState("success");
          return;
        }

        if (pauseSending) return;

        const chunk = file.slice(offset, offset + chunkSize);
        chunk.arrayBuffer().then(buffer => {
          rtcDataChannel.send(buffer);

          if (rtcDataChannel.bufferedAmount >= highWaterMark) {
            pauseSending = true;
          }

          offset += buffer.byteLength;
          console.log(`Chunk sent: ${offset} / ${file.size} bytes`);
          sendNextChunk();
        });
      };

      sendNextChunk();
      rtcDataChannel.onbufferedamountlow = () => {
        console.log("RTC Data channel buffered amount low");
        pauseSending = false; // Now the data channel is ready to send more data
        sendNextChunk();
      };
    };

    rtcDataChannel.onerror = error => {
      console.error("RTC Data channel error:", error);
      notifications.error(`Upload failed: ${error}`);
      setUploadState("idle");
      console.log("Upload state set to 'idle'");
    };
  }

  async function handleHttpUpload(
    file: File,
    alreadyUploadedBytes: number,
    dataChannel: string,
  ) {
    const uploadUrl = `${DEVICE_API}/storage/upload?uploadId=${dataChannel}`;

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader('Content-Range', `bytes ${alreadyUploadedBytes}-${file.size-1}/${file.size}`);

    let lastUploadedBytes = alreadyUploadedBytes;
    let lastUpdateTime = Date.now();
    const speedHistory: number[] = [];

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const totalUploaded = alreadyUploadedBytes + event.loaded;
        const totalSize = file.size;

        const now = Date.now();
        const timeDiff = (now - lastUpdateTime) / 1000; // in seconds
        const bytesDiff = totalUploaded - lastUploadedBytes;

        if (timeDiff > 0) {
          const instantSpeed = bytesDiff / timeDiff; // bytes per second

          // Add to speed history, keeping last 5 readings
          speedHistory.push(instantSpeed);
          if (speedHistory.length > 5) {
            speedHistory.shift();
          }

          // Calculate average speed
          const averageSpeed =
            speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length;

          setUploadSpeed(averageSpeed);
          setUploadProgress((totalUploaded / totalSize) * 100);
        }

        lastUploadedBytes = totalUploaded;
        lastUpdateTime = now;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        setUploadState("success");
        setTimeout(() => {
           onBack()
        }, 1000)
      } else {
        console.error("Upload error:", xhr.statusText);
        setUploadError(xhr.statusText);
        setUploadState("idle");
      }
    };

    xhr.onerror = () => {
      console.error("XHR error:", xhr.statusText);
      setUploadError(xhr.statusText);
      setUploadState("idle");
    };
    
    xhr.onabort = () => {
        console.log("Upload aborted");
        setUploadState("idle");
    }

    // Prepare the data to send
    const blob = file.slice(alreadyUploadedBytes);

    // Send the file data
    xhr.send(blob);
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Reset the upload error when a new file is selected
      setUploadError(null);

      if (
        incompleteFileName &&
        file.name !== incompleteFileName.replace(".incomplete", "")
      ) {
        setFileError(
          $at("Please select the file {{fileName}} to continue the upload.").replace("{{fileName}}", incompleteFileName.replace(".incomplete", "")),
        );
        // Clear the input value to allow selecting the same file again if needed
        event.target.value = "";
        return;
      }

      setFileError(null);
      const validationError = validateSelectedFile(file);
      if (validationError) {
        setFileError(validationError);
        setUploadState("idle");
        event.target.value = "";
        return;
      }
      console.log(`File selected: ${file.name}, size: ${file.size} bytes`);
      setUploadedFileName(file.name);
      setUploadedFileSize(file.size);
      setUploadState("uploading");
      console.log("Upload state set to 'uploading'");

      if ( media === "sd" ) {
        send("startSDStorageFileUpload", { filename: file.name, size: file.size }, resp => {
          console.log("startSDStorageFileUpload response:", resp);
          if ("error" in resp) {
            console.error("Upload error:", resp.error.message);
            setUploadError(resp.error.data || resp.error.message);
            setUploadState("idle");
            console.log("Upload state set to 'idle'");
            return;
          }

          const { alreadyUploadedBytes, dataChannel } = resp.result as {
            alreadyUploadedBytes: number;
            dataChannel: string;
          };

          console.log(
            `Already uploaded bytes: ${alreadyUploadedBytes}, Data channel: ${dataChannel}`,
          );

          if (isOnDevice) {
            handleHttpUpload(file, alreadyUploadedBytes, dataChannel);
          } else {
            handleWebRTCUpload(file, alreadyUploadedBytes, dataChannel);
          }
        });
      }
      else {
        send("startStorageFileUpload", { filename: file.name, size: file.size }, resp => {
          console.log("startStorageFileUpload response:", resp);
          if ("error" in resp) {
            console.error("Upload error:", resp.error.message);
            setUploadError(resp.error.data || resp.error.message);
            setUploadState("idle");
            console.log("Upload state set to 'idle'");
            return;
          }

          const { alreadyUploadedBytes, dataChannel } = resp.result as {
            alreadyUploadedBytes: number;
            dataChannel: string;
          };

          console.log(
            `Already uploaded bytes: ${alreadyUploadedBytes}, Data channel: ${dataChannel}`,
          );

          if (isOnDevice) {
            handleHttpUpload(file, alreadyUploadedBytes, dataChannel);
          } else {
            handleWebRTCUpload(file, alreadyUploadedBytes, dataChannel);
          }
        });        
      }
    }
    // Clear the input value to allow selecting the same file again if needed
    event.target.value = "";
  };

  return (
    <div className="w-full space-y-4 my-4">
        <div
          className="animate-fadeIn space-y-2 opacity-0"
          style={{
            animationDuration: "0.7s",
          }}
        >
          <div
            onClick={() => {
              if (uploadState === "idle") {
                fileInputRef.current?.click();
              }
            }}
            className="block select-none"
          >
            <div className="group">
              <Card
                className={cx("transition-all duration-300", {
                  "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/50":
                    uploadState === "idle",
                })}
              >
                <div className="h-[146px] w-full px-4">
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    {uploadState === "idle" && (
                      <div className="space-y-1">
                        <div className="inline-block">

                            <div className="p-1">
                              <UploadSvg className={`h-[24px] w-[24px] shrink-0 ${text_primary_color}`} />
                            </div>

                        </div>
                        <div style={{fontSize: "14px",fontWeight: "400"}} className=" text-[rgba(22,152,217,1)] dark:text-white">
                          {incompleteFileName 
                            ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="font-semibold">{$at("Resume Upload")}</span>
                                  <span>{$at("Click here to select {{fileName}} to resume upload").replace("{{fileName}}", formatters.truncateMiddle(incompleteFileName.replace(".incomplete", ""), 30))}</span>
                                </div>
                              )
                            : $at("Click here to upload")
                          }
                        </div>
                        {/*<p className="text-xs leading-none text-slate-700 dark:text-slate-300">*/}
                        {/*  {$at("Do not support directories")}*/}
                        {/*</p>*/}
                      </div>
                    )}

                    {uploadState === "uploading" && (
                      <div className="w-full max-w-sm space-y-2 text-left">
                        <div className="inline-block">
                          <Card>
                            <div className="p-1">
                              <LuUpload className="h-4 w-4 shrink-0 text-[rgba(22,152,217,1)] dark:text-[rgba(45,106,229,1)]" />
                            </div>
                          </Card>
                        </div>
                        <h3 className="leading-non text-lg font-semibold text-black dark:text-white">
                          {$at("Uploading")} {formatters.truncateMiddle(uploadedFileName, 30)}
                        </h3>
                        <p className="text-xs leading-none text-slate-700 dark:text-slate-300">
                          {formatters.bytes(uploadedFileSize || 0)}
                        </p>
                        <div className="w-full space-y-2">
                          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-slate-700">
                            <div
                              className="h-3.5 rounded-full bg-[rgba(22,152,217,1)] transition-all duration-500 ease-linear dark:bg-[rgba(45,106,229,1)]"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-xs text-slate-600 dark:text-[#ffffff]">
                            <span>{$at("Uploading...")}...</span>
                            <span>
                              {uploadSpeed !== null
                                ? `${formatters.bytes(uploadSpeed)}/s`
                                : $at("Calculating...")}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {uploadState === "success" && (
                      <div className="space-y-1">
                        <div className="inline-block">
                          <Card>
                            <div className="p-1">
                              <LuCheck className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                            </div>
                          </Card>
                        </div>
                        <h3 className="text-sm leading-none font-semibold text-black dark:text-white">
                          {$at("Upload Successful")}
                        </h3>
                        <p className="text-xs leading-none text-slate-700 dark:text-slate-300">
                          {formatters.truncateMiddle(uploadedFileName, 40)} {$at("Uploaded")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
          <input
            type="file"
            onChange={handleFileChange}
            className="hidden"
            ref={fileInputRef}
            accept={accept}
          />
          {fileError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fileError}</p>
          )}
        </div>

        {/* Display upload error if present */}
        {uploadError && (
          <div
            className="mt-2 animate-fadeIn truncate text-sm text-red-600 dark:text-red-400 opacity-0"
            style={{ animationDuration: "0.7s" }}
          >
            Error: {uploadError}
          </div>
        )}

        <div
          className="flex w-full animate-fadeIn items-end opacity-0"
          style={{
            animationDuration: "0.7s",
            animationDelay: "0.1s",
          }}
        >
        </div>
      {isMobile&&<div className="h-[30px]"></div>}
    </div>
  );
}
