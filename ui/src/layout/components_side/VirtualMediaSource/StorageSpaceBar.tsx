import { useReactAt } from 'i18n-auto-extractor/react';

import { formatters } from "@/utils";

interface StorageSpaceBarProps {
  percentageUsed: number;
  bytesUsed: number;
  bytesFree: number;
}

export default function StorageSpaceBar({ percentageUsed, bytesUsed, bytesFree }: StorageSpaceBarProps) {
  const { $at } = useReactAt();

  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-black dark:text-white">{$at("Available space")}</span>
        <span className="text-slate-700 dark:text-slate-300">{percentageUsed}% {$at("used")}</span>
      </div>
      <div className="h-3.5 w-full overflow-hidden rounded-xs bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-xs bg-[rgba(22,152,217,1)] transition-all duration-300 ease-in-out dark:bg-[rgba(45,106,229,1)]"
          style={{ width: `${percentageUsed}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-slate-600">
        <span className="text-slate-700 dark:text-slate-300">
          {formatters.bytes(bytesUsed)} {$at("used")}
        </span>
        <span className="text-slate-700 dark:text-slate-300">
          {formatters.bytes(bytesFree)} {$at("free")}
        </span>
      </div>
    </>
  );
}