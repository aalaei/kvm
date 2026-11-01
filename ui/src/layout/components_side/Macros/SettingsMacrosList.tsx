import { useEffect, Fragment, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuMoveRight,
  LuCornerDownRight,
  LuCommand,
} from "react-icons/lu";
import { Button as AntdButton } from "antd";
import { useReactAt } from "i18n-auto-extractor/react";
import DeleteSVG from "@assets/second/delete.svg?react";
import ToUpSVG from "@assets/second/to_up.svg?react";
import ToDownSVG from "@assets/second/to_down.svg?react";
import { isMobile } from "react-device-detect";

import { KeySequence, useMacrosStore, generateMacroId, useUiStore } from "@/hooks/stores";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { Button } from "@components/Button";
import EmptyCard from "@components/EmptyCard";
import Card from "@components/Card";
import { MAX_TOTAL_MACROS, COPY_SUFFIX, DEFAULT_DELAY } from "@/constants/macros";
import { keyDisplayMap, modifierDisplayMap } from "@/keyboardMappings";
import notifications from "@/notifications";
import { ConfirmDialog } from "@components/ConfirmDialog";
import LoadingSpinner from "@components/LoadingSpinner";


const normalizeSortOrders = (macros: KeySequence[]): KeySequence[] => {
  return macros.map((macro, index) => ({
    ...macro,
    sortOrder: index + 1,
  }));
};

export interface MenuComponentProps {
  onMenuSelect: (key: string) => void;
  setMacroId: (id: string) => void;
}

const SettingsMacrosList: React.FC<MenuComponentProps> = ({ onMenuSelect,setMacroId }) => {
  const { $at } = useReactAt();
  const { macros, loading, initialized, loadMacros, saveMacros } = useMacrosStore();
  const navigate = useNavigate();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [macroToDelete, setMacroToDelete] = useState<KeySequence | null>(null);
  const toggleSidebarView = useUiStore(state => state.toggleSidebarView);

  const isMaxMacrosReached = useMemo(
    () => macros.length >= MAX_TOTAL_MACROS,
    [macros.length],
  );

  useEffect(() => {
    if (!initialized) {
      loadMacros();
    }
  }, [initialized, loadMacros]);

  const handleDuplicateMacro = useCallback(
    async (macro: KeySequence) => {
      if (!macro?.id || !macro?.name) {
        notifications.error("Invalid macro data");
        return;
      }

      if (isMaxMacrosReached) {
        notifications.error(`Maximum of ${MAX_TOTAL_MACROS} macros allowed`);
        return;
      }

      setActionLoadingId(macro.id);

      const newMacroCopy: KeySequence = {
        ...JSON.parse(JSON.stringify(macro)),
        id: generateMacroId(),
        name: `${macro.name} ${COPY_SUFFIX}`,
        sortOrder: macros.length + 1,
      };

      try {
        await saveMacros(normalizeSortOrders([...macros, newMacroCopy]));
        notifications.success(`Macro "${newMacroCopy.name}" duplicated successfully`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          notifications.error(`Failed to duplicate macro: ${error.message}`);
        } else {
          notifications.error("Failed to duplicate macro");
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [isMaxMacrosReached, macros, saveMacros, setActionLoadingId],
  );

  const handleMoveMacro = useCallback(
    async (index: number, direction: "up" | "down", macroId: string) => {
      if (!Array.isArray(macros) || macros.length === 0) {
        notifications.error("No macros available");
        return;
      }

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= macros.length) return;

      setActionLoadingId(macroId);

      try {
        const newMacros = [...macros];
        [newMacros[index], newMacros[newIndex]] = [newMacros[newIndex], newMacros[index]];
        const updatedMacros = normalizeSortOrders(newMacros);

        await saveMacros(updatedMacros);
        notifications.success("Macro order updated successfully");
      } catch (error: unknown) {
        if (error instanceof Error) {
          notifications.error(`Failed to reorder macros: ${error.message}`);
        } else {
          notifications.error("Failed to reorder macros");
        }
      } finally {
        setActionLoadingId(null);
      }
    },
    [macros, saveMacros, setActionLoadingId],
  );

  const handleDeleteMacro = useCallback(async () => {
    if (!macroToDelete?.id) return;

    setActionLoadingId(macroToDelete.id);
    try {
      const updatedMacros = normalizeSortOrders(
        macros.filter(m => m.id !== macroToDelete.id),
      );
      await saveMacros(updatedMacros);
      notifications.success(`Macro "${macroToDelete.name}" deleted successfully`);
      setShowDeleteConfirm(false);
      setMacroToDelete(null);
    } catch (error: unknown) {
      if (error instanceof Error) {
        notifications.error(`Failed to delete macro: ${error.message}`);
      } else {
        notifications.error("Failed to delete macro");
      }
    } finally {
      setActionLoadingId(null);
    }
  }, [macroToDelete, macros, saveMacros]);

  const MacroList = useMemo(
    () => (
      <div className="space-y-2">
        {macros.map((macro, index) => (
            <Card key={macro.id} className={`${isMobile?"p-[10px]":"p-[20px]"} `}>
            <div className={`flex items-center justify-between ${isMobile?"flex-col w-full items-start gap-1":"flex-row"}`}>
              <div className={`flex gap-1 px-2 ${isMobile ? "flex-row " : "flex-col"}`}>
                <AntdButton
                  onClick={() => handleMoveMacro(index, "up", macro.id)}
                  disabled={index === 0 || actionLoadingId === macro.id}
                  icon={<ToUpSVG/>}
                />
                <AntdButton
                  onClick={() => handleMoveMacro(index, "down", macro.id)}
                  disabled={index === macros.length - 1 || actionLoadingId === macro.id}
                  icon={<ToDownSVG/>}
                />
              </div>

              <div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
                <h3 className="truncate text-sm font-semibold text-black dark:text-white">
                  {macro.name}
                </h3>
                <p className={`mt-1 overflow-hidden text-xs text-slate-500 dark:text-[#ffffff]`}>
                  <span className="flex flex-col items-start gap-1">
                    {macro.steps.map((step, stepIndex) => {
                      const StepIcon = stepIndex === 0 ? LuMoveRight : LuCornerDownRight;

                      return (
                        <span key={stepIndex} className="inline-flex items-center">
                          <StepIcon className="mr-1 h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                          <span
                            className="rounded-md border border-slate-200/50 px-2 py-0.5 dark:border-slate-700/50 ">
                            {(Array.isArray(step.modifiers) &&
                              step.modifiers.length > 0) ||
                            (Array.isArray(step.keys) && step.keys.length > 0) ? (
                              <>
                                {Array.isArray(step.modifiers) &&
                                  step.modifiers.map((modifier, idx) => (
                                    <Fragment key={`mod-${idx}`}>
                                      <span className="font-medium text-slate-600 dark:text-slate-200">
                                        {modifierDisplayMap[modifier] || modifier}
                                      </span>
                                      {idx < step.modifiers.length - 1 && (
                                        <span className="text-slate-400 dark:text-slate-600">
                                          {" "}
                                          +{" "}
                                        </span>
                                      )}
                                    </Fragment>
                                  ))}

                                {Array.isArray(step.modifiers) &&
                                  step.modifiers.length > 0 &&
                                  Array.isArray(step.keys) &&
                                  step.keys.length > 0 && (
                                    <span className="text-slate-400 dark:text-slate-600">
                                      {" "}
                                      +{" "}
                                    </span>
                                  )}

                                {Array.isArray(step.keys) &&
                                  step.keys.map((key, idx) => (
                                    <Fragment key={`key-${idx}`}>
                                      <span className="font-medium text-blue-600 dark:text-blue-400">
                                        {keyDisplayMap[key] || key}
                                      </span>
                                      {idx < step.keys.length - 1 && (
                                        <span className="text-slate-400 dark:text-slate-600">
                                          {" "}
                                          +{" "}
                                        </span>
                                      )}
                                    </Fragment>
                                  ))}
                              </>
                            ) : (
                              <span className="font-medium text-slate-500 dark:text-[#ffffff]">
                                {$at("Delay Only")}
                              </span>
                            )}
                            {step.delay !== DEFAULT_DELAY && (
                              <span className="ml-1 text-slate-400 dark:text-slate-500">
                                ({step.delay}ms)
                              </span>
                            )}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                </p>
              </div>

              <div className={`${isMobile?"":"ml-4 "}flex items-center gap-1`}>

                <AntdButton
                  disabled={actionLoadingId === macro.id}
                  onClick={() => {
                    setMacroId(macro.id);
                    onMenuSelect("edit");}}
                >
                  {$at("Edit")}
                </AntdButton>

                <AntdButton
                  disabled={actionLoadingId === macro.id}
                  onClick={() => handleDuplicateMacro(macro)}
                >
                  {$at("Copy")}
                </AntdButton>
                <div
                  onClick={() => {setMacroToDelete(macro);setShowDeleteConfirm(true);}}
                  className={"w-[30px] h-[30px] flex items-center justify-center bg-[red] rounded"}
                >
                  <DeleteSVG />
                </div>


              </div>
            </div>
          </Card>
        ))}
        <div className={` ${isMobile?"w-full flex justify-between":""}`}>
        <AntdButton
          type="primary"
          onClick={() => onMenuSelect("add")}
          className={isMobile?"w-[49%]":""}
          disabled={isMaxMacrosReached}
        >
          {$at("+ Add new macro")}
        </AntdButton>
        <AntdButton
          className={isMobile?"w-[49%]":"ml-2"}
          onClick={() => {    toggleSidebarView("Macros");}}
        >
          {$at("Cancel")}

        </AntdButton>
        </div>

        <ConfirmDialog
          open={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false);
            setMacroToDelete(null);
          }}
          title={$at("Delete Macro")}
          description={`${$at("Are you sure you want to delete")} "${macroToDelete?.name}" ${$at("? This action cannot be undone.")}`}
          variant="danger"
          confirmText={actionLoadingId === macroToDelete?.id ? $at("Deleting...") : $at("Delete")}
          cancelText={$at("Cancel")}
          onConfirm={handleDeleteMacro}
          isConfirming={actionLoadingId === macroToDelete?.id}
        />
      </div>
    ),
    [
      macros,
      showDeleteConfirm,
      macroToDelete?.name,
      macroToDelete?.id,
      actionLoadingId,
      handleDeleteMacro,
      handleMoveMacro,
      handleDuplicateMacro,
      navigate,
    ],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SettingsPageHeader
          title={""}
          description={$at("Combine keystrokes into a single action for faster workflows.")}
        />

      </div>

      <div className="space-y-4">

        {loading && macros.length === 0 ? (
          <EmptyCard
            IconElm={LuCommand}
            headline={$at("Loading macros...")}
            BtnElm={
              <div className="my-2 flex flex-col items-center space-y-2 text-center">
                <LoadingSpinner className="h-6 w-6 text-blue-700 dark:text-blue-500" />
              </div>
            }
          />
        ) : macros.length === 0 ? (
          <EmptyCard
            IconElm={LuCommand}
            iconClassName="text-blue-400 dark:text-blue-700"
            headline={$at("Create Your First Macro")}
            description={$at("Combine keystrokes into a single action")}
            BtnElm={
              <Button
                size="SM"
                theme="primary"
                text={$at("Add New Macro")}
                onClick={() => onMenuSelect("add")}
                disabled={isMaxMacrosReached}
                aria-label={$at("Add new macro")}
              />
            }
          />
        ) : (
          MacroList
        )}
      </div>
    </div>
  );
};
export default SettingsMacrosList;
