import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { LuTrash2 } from "react-icons/lu";
import {useReactAt} from 'i18n-auto-extractor/react'

import { KeySequence, useMacrosStore } from "@/hooks/stores";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { MacroForm } from "@components/Macro/MacroForm";
import notifications from "@/notifications";
import { Button } from "@components/Button";
import { ConfirmDialog } from "@components/ConfirmDialog";

const normalizeSortOrders = (macros: KeySequence[]): KeySequence[] => {
  return macros.map((macro, index) => ({
    ...macro,
    sortOrder: index + 1,
  }));
};
export interface MenuComponentProps {
  onMenuSelect: (key:string) => void;
  macroId?:string;
}

const SettingsMacrosEdit: React.FC<MenuComponentProps> = ({ onMenuSelect,macroId }) => {
  const { $at }= useReactAt();
  const { macros, saveMacros } = useMacrosStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  // const { macroId } = useParams<{ macroId: string }>();
  const [macro, setMacro] = useState<KeySequence | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const foundMacro = macros.find(m => m.id === macroId);
    if (foundMacro) {
      setMacro({
        ...foundMacro,
        steps: foundMacro.steps.map(step => ({
          ...step,
          keys: Array.isArray(step.keys) ? step.keys : [],
          modifiers: Array.isArray(step.modifiers) ? step.modifiers : [],
          delay: typeof step.delay === 'number' ? step.delay : 0
        }))
      });
    } else {

      onMenuSelect("index")
      console.log("onMenuSelect2")
    }
  }, [macroId, macros, navigate]);

  const handleUpdateMacro = async (updatedMacro: Partial<KeySequence>) => {
    if (!macro) return;

    setIsUpdating(true);
    try {
      const newMacros = macros.map(m =>
        m.id === macro.id ? {
          ...macro,
          name: updatedMacro.name!.trim(),
          steps: updatedMacro.steps || [],
        } : m
      );

      await saveMacros(normalizeSortOrders(newMacros));
      notifications.success(`Macro "${updatedMacro.name}" updated successfully`);
      console.log("onMenuSelect1")
      onMenuSelect("index");
    } catch (error: unknown) {
      if (error instanceof Error) {
        notifications.error(`Failed to update macro: ${error.message}`);
      } else {
        notifications.error("Failed to update macro");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteMacro = async () => {
    if (!macro) return;

    setIsDeleting(true);
    try {
      const updatedMacros = normalizeSortOrders(macros.filter(m => m.id !== macro.id));
      await saveMacros(updatedMacros);
      notifications.success(`Macro "${macro.name}" deleted successfully`);
      navigate("../macros");
    } catch (error: unknown) {
      if (error instanceof Error) {
        notifications.error(`Failed to delete macro: ${error.message}`);
      } else {
        notifications.error("Failed to delete macro");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!macro) return null;
//macrosSideTitle
  return (
    <div className="space-y-4">
    <div className="flex items-center justify-between">
    <SettingsPageHeader
      title={""}
  description={$at("Modify your keyboard macro")}
  />
  <Button
  size="SM"
  theme="light"
  text={$at("Delete Macro")}
  className="text-red-500 dark:text-red-400"
  LeadingIcon={LuTrash2}
  onClick={() => setShowDeleteConfirm(true)}
  disabled={isDeleting}
  />
  </div>
  <div onKeyUp={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <MacroForm
      initialData={macro}
      onSubmit={handleUpdateMacro}
      onCancel={() => {
        console.log("MacroForm onCancel")
        onMenuSelect("index");
      }}
      isSubmitting={isUpdating}
    />
  </div>

  <ConfirmDialog
    open={showDeleteConfirm}
    onClose={() => setShowDeleteConfirm(false)}
    title={$at("Delete Macro")}
    description={$at("Are you sure you want to delete this macro? This action cannot be undone.")}
    variant="danger"
    confirmText={isDeleting ? $at("Deleting") : $at("Delete")}
    cancelText={$at("Cancel")}
    onConfirm={() => {
      handleDeleteMacro();
      setShowDeleteConfirm(false);
    }}
    isConfirming={isDeleting}
  />
  </div>
);
}
export default SettingsMacrosEdit;
