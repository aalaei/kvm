const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
]);

const SPECIAL_CODE_TO_KEY: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

type ShortcutSpec = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
};

function normalizeShortcutToken(token: string) {
  return token.trim().toLowerCase();
}

function normalizeKeyName(key: string) {
  const trimmed = key.trim();
  if (trimmed.length === 1) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  if (lower === "escape") return "Esc";
  if (lower === " ") return "Space";
  if (lower === "arrowup") return "Up";
  if (lower === "arrowdown") return "Down";
  if (lower === "arrowleft") return "Left";
  if (lower === "arrowright") return "Right";
  return trimmed;
}

function keyFromEvent(e: KeyboardEvent) {
  const { code, key } = e;
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (SPECIAL_CODE_TO_KEY[code]) return SPECIAL_CODE_TO_KEY[code];
  return normalizeKeyName(key);
}

function parseShortcut(shortcut: string): ShortcutSpec | null {
  if (!shortcut) return null;
  const tokens = shortcut
    .split("+")
    .map(token => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const spec: ShortcutSpec = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };

  for (const token of tokens) {
    const normalized = normalizeShortcutToken(token);
    if (normalized === "ctrl" || normalized === "control") {
      spec.ctrl = true;
      continue;
    }
    if (normalized === "shift") {
      spec.shift = true;
      continue;
    }
    if (normalized === "alt" || normalized === "option") {
      spec.alt = true;
      continue;
    }
    if (normalized === "meta" || normalized === "cmd" || normalized === "command") {
      spec.meta = true;
      continue;
    }
    spec.key = normalizeKeyName(token);
  }

  if (!spec.key) return null;
  return spec;
}

export function eventMatchesShortcut(e: KeyboardEvent, shortcut: string) {
  const spec = parseShortcut(shortcut);
  if (!spec) return false;
  const eventKey = keyFromEvent(e);
  return (
    e.ctrlKey === spec.ctrl
    && e.shiftKey === spec.shift
    && e.altKey === spec.alt
    && e.metaKey === spec.meta
    && eventKey === spec.key
  );
}

export function shortcutFromKeyboardEvent(e: KeyboardEvent) {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyFromEvent(e);
  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.altKey) modifiers.push("Alt");
  if (e.metaKey) modifiers.push("Meta");
  if (modifiers.length === 0) return null;
  return [...modifiers, key].join("+");
}
