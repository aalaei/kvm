import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {useReactAt} from 'i18n-auto-extractor/react'

import { KeySequence, useMacrosStore, generateMacroId } from "@/hooks/stores";
import { SettingsPageHeader } from "@components/Settings/SettingsPageheader";
import { MacroForm } from "@components/Macro/MacroForm";
import { DEFAULT_DELAY } from "@/constants/macros";
import notifications from "@/notifications";
export interface MenuComponentProps {
  onMenuSelect: (key:string) => void;
}
const SettingsMacrosAdd: React.FC<MenuComponentProps> = ({ onMenuSelect}) => {

  const { $at }= useReactAt();
  const { macros, saveMacros } = useMacrosStore();
  const [isSaving, setIsSaving] = useState(false);

  const normalizeSortOrders = (macros: KeySequence[]): KeySequence[] => {
    return macros.map((macro, index) => ({
      ...macro,
      sortOrder: index + 1,
    }));
  };

  const handleAddMacro = async (macro: Partial<KeySequence>) => {
    setIsSaving(true);
    try {
      const newMacro: KeySequence = {
        id: generateMacroId(),
        name: macro.name!.trim(),
        steps: macro.steps || [],
        sortOrder: macros.length + 1,
      };

      await saveMacros(normalizeSortOrders([...macros, newMacro]));
      notifications.success(`Macro "${newMacro.name}" created successfully`);
      // navigate("../");
      onMenuSelect("index")
    } catch (error: unknown) {
      if (error instanceof Error) {
        notifications.error(`Failed to create macro: ${error.message}`);
      } else {
        notifications.error("Failed to create macro");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title={""}
        description={$at("Create a new keyboard macro")}
      />

      <div  onKeyUp={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <MacroForm
        initialData={{
          name: "",
          steps: [{ keys: [], modifiers: [], delay: DEFAULT_DELAY }],
        }}
        onSubmit={handleAddMacro}
        onCancel={() => onMenuSelect("index")}
        isSubmitting={isSaving}
      />
      </div>
    </div>
  );
}
export default  SettingsMacrosAdd;
