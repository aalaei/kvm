import { useReactAt } from "i18n-auto-extractor/react";
import { useState } from "react";
import { Button as AntButton } from "antd";
import { DeleteOutlined, DownloadOutlined } from "@ant-design/icons";

import { cx } from "@/cva.config";
import { formatters } from "@/utils";
import { Button } from "@components/Button";

export function PreUploadedImageItem({
                                       name,
                                       size,
                                       uploadedAt,
                                       isSelected,
                                       isIncomplete,
                                       onDownload,
                                       onDelete,
                                       onContinueUpload,
                                       onSelected
                                     }: {
  name: string;
  size: string;
  uploadedAt: string;
  isSelected: boolean;
  isIncomplete: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onContinueUpload: () => void;
  onSelected?: () => void;
}) {
  const { $at }= useReactAt();
  const [isHovering, setIsHovering] = useState(false);
  return (
    <label
      htmlFor={name}
      className={cx(
        "flex w-full cursor-pointer items-center justify-between p-3 transition-colors",
        {
          "bg-[rgba(22,152,217,0.5)] dark:bg-[rgba(45,106,229,0.5)]": isSelected,
          "hover:bg-gray-50 dark:hover:bg-slate-700/50": !isSelected,
          "cursor-default": isIncomplete,
        },
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => {
        if (!isIncomplete && onSelected) {
          onSelected();
        }
      }}
    >
      <div className="flex items-center gap-x-4">
        <div className="space-y-0.5 select-none">
          <div className="text-sm leading-none font-semibold dark:text-white">
            {formatters.truncateMiddle(name, 45)}
          </div>
          <div className="flex items-center text-sm">
            <div className="flex items-center gap-x-1 text-slate-600 dark:text-[#ffffff]">
              {formatters.date(new Date(uploadedAt), { month: "short" })}
            </div>
            <div className="mx-1 h-[10px] w-px bg-slate-300 text-slate-300 dark:bg-slate-600"></div>
            <div className="text-gray-600 dark:text-[#ffffff]">{size}</div>
          </div>
        </div>
      </div>
      <div className="relative flex items-center gap-x-3 select-none">
        <AntButton
          type="text"
          icon={<DownloadOutlined />}
          onClick={e => {
            e.stopPropagation();
            onDownload();
          }}
        />
        <AntButton
          type="text"
          icon={<DeleteOutlined style={{ color: 'red' }}/>}
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
        />



        {isIncomplete ? (
          <Button
            size="XS"
            theme="light"
            text={$at("Continue Uploading")}
            onClick={e => {
              e.stopPropagation();
              onContinueUpload();
            }}
          />
        ): onSelected && (
            <input
                type="radio"
                checked={isSelected}
                onChange={onSelected}
                name={name}
                className="form-radio h-3 w-3 border-slate-800/30 bg-white text-[rgba(22,152,217,1)] focus:ring-blue-500 disabled:opacity-30 dark:border-slate-300/20 dark:text-[rgba(45,106,229,1)]"
                onClick={e => e.stopPropagation()} // Prevent double-firing of onSelect
            />
        )}
      </div>
    </label>
  );
}