export const CHAT_COLOR_VALUES = [
  'red',
  'orange',
  'amber',
  'gold',
  'chartreuse',
  'emerald',
  'forest',
  'cyan',
  'turquoise',
  'azure',
  'navy',
  'indigo',
  'violet',
  'plum',
  'fuchsia',
  'magenta',
  'salmon',
  'crimson',
  'silver',
  'charcoal',
] as const;

export type ChatColor = (typeof CHAT_COLOR_VALUES)[number];
export const CHAT_BORDER_VALUES = ['black', ...CHAT_COLOR_VALUES] as const;
export type ChatBorder = (typeof CHAT_BORDER_VALUES)[number];
export const DEFAULT_CHAT_COLOR: ChatColor = 'amber';
export const DEFAULT_CHAT_BORDER: ChatBorder = 'black';

export const CHAT_COLOR_HEX: Record<ChatColor, string> = {
  red: '#f87171',
  orange: '#f97316',
  amber: '#fcd34d',
  gold: '#eab308',
  chartreuse: '#84cc16',
  emerald: '#34d399',
  forest: '#15803d',
  cyan: '#22d3ee',
  turquoise: '#0d9488',
  azure: '#0ea5e9',
  navy: '#1e40af',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  plum: '#6b21a8',
  fuchsia: '#e879f9',
  magenta: '#db2777',
  salmon: '#fda4af',
  crimson: '#be123c',
  silver: '#cbd5e1',
  charcoal: '#334155',
};

export const CHAT_COLOR_FOREGROUND_HEX: Record<ChatColor, string> = {
  red: '#020617',
  orange: '#020617',
  amber: '#020617',
  gold: '#020617',
  chartreuse: '#020617',
  emerald: '#020617',
  forest: '#ffffff',
  cyan: '#020617',
  turquoise: '#ffffff',
  azure: '#020617',
  navy: '#ffffff',
  indigo: '#ffffff',
  violet: '#ffffff',
  plum: '#ffffff',
  fuchsia: '#020617',
  magenta: '#ffffff',
  salmon: '#020617',
  crimson: '#ffffff',
  silver: '#020617',
  charcoal: '#ffffff',
};

export const CHAT_COLOR_NAME_HEX: Record<ChatColor, string> = {
  red: '#fca5a5',
  orange: '#fdba74',
  amber: '#fcd34d',
  gold: '#fde047',
  chartreuse: '#bef264',
  emerald: '#6ee7b7',
  forest: '#86efac',
  cyan: '#67e8f9',
  turquoise: '#5eead4',
  azure: '#7dd3fc',
  navy: '#93c5fd',
  indigo: '#a5b4fc',
  violet: '#c4b5fd',
  plum: '#d8b4fe',
  fuchsia: '#f0abfc',
  magenta: '#f9a8d4',
  salmon: '#fecdd3',
  crimson: '#fb7185',
  silver: '#cbd5e1',
  charcoal: '#94a3b8',
};
export const CHAT_BORDER_HEX: Record<ChatBorder, string> = {
  black: '#020617',
  ...CHAT_COLOR_HEX,
};

export function normalizeChatColor(value?: string | null): ChatColor {
  return CHAT_COLOR_VALUES.includes(value as ChatColor) ? value as ChatColor : DEFAULT_CHAT_COLOR;
}

export function normalizeChatBorder(value?: string | null): ChatBorder {
  return CHAT_BORDER_VALUES.includes(value as ChatBorder) ? value as ChatBorder : DEFAULT_CHAT_BORDER;
}

export function getChatSwatchStyle(value?: string | null) {
  return { backgroundColor: CHAT_COLOR_HEX[normalizeChatColor(value)] };
}

export function getChatBorderSwatchStyle(value?: string | null) {
  const normalizedBorder = normalizeChatBorder(value);
  return { backgroundColor: CHAT_BORDER_HEX[normalizedBorder] };
}

export function getChatBubbleStyle(color?: string | null, border?: string | null) {
  const normalizedColor = normalizeChatColor(color);
  const normalizedBorder = normalizeChatBorder(border);
  return {
    backgroundColor: CHAT_COLOR_HEX[normalizedColor],
    color: CHAT_COLOR_FOREGROUND_HEX[normalizedColor],
    borderColor: CHAT_BORDER_HEX[normalizedBorder],
    borderStyle: 'solid',
    borderWidth: '2px',
  };
}

export function getChatInviteButtonStyle(color?: string | null, disabled = false) {
  if (disabled) {
    return {
      backgroundColor: 'rgba(2, 6, 23, 0.8)',
      color: '#94a3b8',
    };
  }

  const normalizedColor = normalizeChatColor(color);
  return {
    backgroundColor: '#020617',
    color: CHAT_COLOR_NAME_HEX[normalizedColor],
  };
}

export function getChatNameStyle(color?: string | null) {
  return { color: CHAT_COLOR_NAME_HEX[normalizeChatColor(color)] };
}
