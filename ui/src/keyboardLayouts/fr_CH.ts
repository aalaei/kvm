import { KeyboardLayout, KeyCombo } from "../keyboardLayouts"
import { chars as chars_de_CH, de_CH_keyDisplayMap } from "./de_CH"
import { modifierDisplayMap, virtualKeyboard } from "./en_US"

const name = "Français de Suisse";
const isoCode = "fr-CH";

export const chars = {
  ...chars_de_CH,
  "è": { key: "BracketLeft" },
  "ü": { key: "BracketLeft", shift: true },
  "é": { key: "Semicolon" },
  "ö": { key: "Semicolon", shift: true },
  "à": { key: "Quote" },
  "ä": { key: "Quote", shift: true },
} as Record<string, KeyCombo>;

const fr_CH_keyDisplayMap = {
  ...de_CH_keyDisplayMap,
  BracketLeft: "è",
  "(BracketLeft)": "ü",
  Semicolon: "é",
  "(Semicolon)": "ö",
  Quote: "à",
  "(Quote)": "ä",
} as Record<string, string>;

export const fr_CH: KeyboardLayout = {
  isoCode,
  name,
  chars,
  keyDisplayMap: fr_CH_keyDisplayMap,
  modifierDisplayMap,
  virtualKeyboard,
};
