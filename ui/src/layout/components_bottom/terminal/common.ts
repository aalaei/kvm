export const SOLARIZED_THEME = {
  background: "#0f172a", // Solarized base03
  foreground: "#839496", // Solarized base0
  cursor: "#93a1a1", // Solarized base1
  cursorAccent: "#002b36", // Solarized base03
  black: "#073642", // Solarized base02
  red: "#dc322f", // Solarized red
  green: "#859900", // Solarized green
  yellow: "#b58900", // Solarized yellow
  blue: "#268bd2", // Solarized blue
  magenta: "#d33682", // Solarized magenta
  cyan: "#2aa198", // Solarized cyan
  white: "#eee8d5", // Solarized base2
  brightBlack: "#002b36", // Solarized base03
  brightRed: "#cb4b16", // Solarized orange
  brightGreen: "#586e75", // Solarized base01
  brightYellow: "#657b83", // Solarized base00
  brightBlue: "#839496", // Solarized base0
  brightMagenta: "#6c71c4", // Solarized violet
  brightCyan: "#93a1a1", // Solarized base1
  brightWhite: "#fdf6e3", // Solarized base3
} as const;
export const TERMINAL_CONFIG = {
  theme: SOLARIZED_THEME,
  fontFamily: "'Fira Code', Menlo, Monaco, 'Courier New', monospace",
  fontSize: 13,
  allowProposedApi: true,
  scrollback: 1000,
  cursorBlink: true,
  smoothScrollDuration: 100,
  macOptionIsMeta: true,
  macOptionClickForcesSelection: true,
  convertEol: true,
  linuxMode: false,
  // Add these configurations:
  cursorStyle: "block",
  rendererType: "canvas", // Ensure we're using the canvas renderer
} as const;