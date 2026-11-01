import { LuX } from "react-icons/lu";
import { Button as AntdButton } from "antd";
import { useReactAt } from 'i18n-auto-extractor/react'
import UpSVG from "@assets/second/up.svg?react";
import DownSVG from "@assets/second/down.svg?react";
import DeleteSVG from "@assets/second/delete.svg?react";

import { Button } from "@components/Button";
import { Combobox } from "@components/Macro/Combobox";
import { SelectMenuBasic } from "@components/SelectMenuBasic";
import Card from "@components/Card";
import { keys, modifiers, keyDisplayMap } from "@/keyboardMappings";
import { MAX_KEYS_PER_STEP, DEFAULT_DELAY } from "@/constants/macros";
import FieldLabel from "@components/FieldLabel";

// Filter out modifier keys since they're handled in the modifiers section
const modifierKeyPrefixes = ['Alt', 'Control', 'Shift', 'Meta'];

const keyOptions = Object.keys(keys)
  .filter(key => !modifierKeyPrefixes.some(prefix => key.startsWith(prefix)))
  .map(key => ({
    value: key,
    label: keyDisplayMap[key] || key,
  }));

const modifierOptions = Object.keys(modifiers).map(modifier => ({
  value: modifier,
  label: modifier.replace(/^(Control|Alt|Shift|Meta)(Left|Right)$/, "$1 $2"),
}));

const groupedModifiers: Record<string, typeof modifierOptions> = {
  Control: modifierOptions.filter(mod => mod.value.startsWith('Control')),
  Shift: modifierOptions.filter(mod => mod.value.startsWith('Shift')),
  Alt: modifierOptions.filter(mod => mod.value.startsWith('Alt')),
  Meta: modifierOptions.filter(mod => mod.value.startsWith('Meta')),
};

const basePresetDelays = [
  { value: "50", label: "50ms" },
  { value: "100", label: "100ms" },
  { value: "200", label: "200ms" },
  { value: "300", label: "300ms" },
  { value: "500", label: "500ms" },
  { value: "750", label: "750ms" },
  { value: "1000", label: "1000ms" },
  { value: "1500", label: "1500ms" },
  { value: "2000", label: "2000ms" },
];

const PRESET_DELAYS = basePresetDelays.map(delay => {
  if (parseInt(delay.value, 10) === DEFAULT_DELAY) {
    return { ...delay, label: "Default" };
  }
  return delay;
});

interface MacroStep {
  keys: string[];
  modifiers: string[];
  delay: number;
}

interface MacroStepCardProps {
  step: MacroStep;
  stepIndex: number;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onKeySelect: (option: { value: string | null; keys?: string[] }) => void;
  onKeyQueryChange: (query: string) => void;
  keyQuery: string;
  onModifierChange: (modifiers: string[]) => void;
  onDelayChange: (delay: number) => void;
  isLastStep: boolean;
}

const ensureArray = <T,>(arr: T[] | null | undefined): T[] => {
  return Array.isArray(arr) ? arr : [];
};

export function MacroStepCard({
  step,
  stepIndex,
  onDelete,
  onMoveUp,
  onMoveDown,
  onKeySelect,
  onKeyQueryChange,
  keyQuery,
  onModifierChange,
  onDelayChange,
  isLastStep
}: MacroStepCardProps) {
  const { $at }= useReactAt();

  const getFilteredKeys = () => {
    const selectedKeys = ensureArray(step.keys);
    const availableKeys = keyOptions.filter(option => !selectedKeys.includes(option.value));
    
    if (keyQuery === '') {
      return availableKeys;
    } else {
      return availableKeys.filter(option => option.label.toLowerCase().includes(keyQuery.toLowerCase()));
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AntdButton
            type={"primary"}
            shape="circle"
          >{stepIndex + 1}
          </AntdButton>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center gap-1">
            <Button
              size="XS"
              theme="light"
              onClick={onMoveUp}
              disabled={stepIndex === 0}
              LeadingIcon={UpSVG}
            />
            <Button
              size="XS"
              theme="light"
              onClick={onMoveDown}
              disabled={isLastStep}
              LeadingIcon={DownSVG}
            />
          </div>
          {(onDelete && stepIndex!==0) &&(
            <div
              onClick={onDelete}
              className={"w-[26px] h-[26px] flex items-center justify-center bg-[red] rounded"}
            >
              <DeleteSVG />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 mt-2">
        <div className="w-full flex flex-col gap-2">
          <FieldLabel label={$at("Modifiers")} />
          <div className="inline-flex flex-wrap gap-3">
            {Object.entries(groupedModifiers).map(([group, mods]) => (
              <div key={group} className="relative min-w-[120px] rounded-md border border-slate-200 dark:border-slate-700 p-2">
                <span className="absolute -top-2.5 left-2 px-1 text-xs font-medium bg-white dark:bg-slate-800 text-slate-500 dark:text-[#ffffff]">
                  {group}
                </span>
                <div className="flex flex-wrap gap-4 pt-1">
                  {mods.map(option => (
                    <Button
                      key={option.value}
                      size="XS"
                      theme={ensureArray(step.modifiers).includes(option.value) ? "primary" : "light"}
                      text={option.label.split(' ')[1] || option.label}
                      onClick={() => {
                        const modifiersArray = ensureArray(step.modifiers);
                        const isSelected = modifiersArray.includes(option.value);
                        const newModifiers = isSelected
                          ? modifiersArray.filter(m => m !== option.value)
                          : [...modifiersArray, option.value];
                        onModifierChange(newModifiers);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="w-full flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <FieldLabel label={$at("Keys")} description={`${$at("Maximum")} ${MAX_KEYS_PER_STEP} ${$at("keys per step.")}`} />
          </div>
          {ensureArray(step.keys) && step.keys.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-2">
              {step.keys.map((key, keyIndex) => (
                <span
                  key={keyIndex}
                  className="inline-flex items-center py-0.5 rounded-md bg-blue-100 px-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                >
                  <span className="px-1">
                    {keyDisplayMap[key] || key}
                  </span>
                  <Button
                    size="XS"
                    className=""
                    theme="blank"
                    onClick={() => {
                      const newKeys = ensureArray(step.keys).filter((_, i) => i !== keyIndex);
                      onKeySelect({ value: null, keys: newKeys });
                    }}
                    LeadingIcon={LuX}
                  />
                </span>
              ))}
            </div>
          )}
          <div className="relative w-full">
            <Combobox
              onChange={value => {
                if (!value) return;
                onKeySelect(value);
                onKeyQueryChange('');
              }}
              displayValue={() => keyQuery}
              onInputChange={onKeyQueryChange}
              options={getFilteredKeys}
              disabledMessage={$at("Max keys reached")}
              size="SM"
              immediate
              disabled={ensureArray(step.keys).length >= MAX_KEYS_PER_STEP}
              placeholder={ensureArray(step.keys).length >= MAX_KEYS_PER_STEP ? $at("Max keys reached") : $at("Search for key...")}
              emptyMessage={$at("No matching keys found")}
            />
          </div>
        </div>
        
        <div className="w-full flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <FieldLabel label={$at("Step Duration")} description={$at("Time to wait before executing the next step.")} />
          </div>
          <div className="flex items-center gap-3">
            <SelectMenuBasic
              size="SM"
              fullWidth
              value={step.delay.toString()}
              onChange={(e) => onDelayChange(parseInt(e.target.value, 10))}
              options={PRESET_DELAYS}
            />
          </div>
        </div>
      </div>
    </Card>
  );
} 
