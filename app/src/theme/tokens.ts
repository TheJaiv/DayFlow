// Design tokens. Every colour, gap and radius in the app comes from here, so
// the light and dark palettes stay in lockstep -- a screen cannot invent a
// one-off grey that only looks right in one mode.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
} as const;

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  overlay: string;
  /** Priority pills on the To-Do list. */
  priority: { LOW: string; MEDIUM: string; HIGH: string };
  /** Named colours shared by timetable events and habits. */
  tags: Record<TagName, string>;
}

export type TagName =
  | "blue"
  | "purple"
  | "green"
  | "orange"
  | "pink"
  | "red"
  | "teal";

export const TAG_NAMES: TagName[] = [
  "blue",
  "purple",
  "green",
  "orange",
  "pink",
  "red",
  "teal",
];

export const lightColors: ThemeColors = {
  bg: "#F6F7F9",
  surface: "#FFFFFF",
  surfaceAlt: "#EFF1F4",
  border: "#E1E5EA",
  text: "#111418",
  textMuted: "#596273",
  textFaint: "#98A2B3",
  accent: "#0284C7",
  accentSoft: "#E0F2FE",
  onAccent: "#FFFFFF",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#15803D",
  overlay: "rgba(9, 12, 17, 0.45)",
  priority: { LOW: "#64748B", MEDIUM: "#D97706", HIGH: "#DC2626" },
  tags: {
    blue: "#2563EB",
    purple: "#7C3AED",
    green: "#16A34A",
    orange: "#EA580C",
    pink: "#DB2777",
    red: "#DC2626",
    teal: "#0D9488",
  },
};

export const darkColors: ThemeColors = {
  bg: "#0B0D11",
  surface: "#151920",
  surfaceAlt: "#1D222B",
  border: "#2A303B",
  text: "#F1F4F8",
  textMuted: "#9AA5B5",
  textFaint: "#6B7686",
  accent: "#38BDF8",
  accentSoft: "#0C2A3D",
  onAccent: "#04141F",
  danger: "#F87171",
  dangerSoft: "#3B1618",
  success: "#4ADE80",
  overlay: "rgba(0, 0, 0, 0.6)",
  priority: { LOW: "#94A3B8", MEDIUM: "#FBBF24", HIGH: "#F87171" },
  tags: {
    blue: "#60A5FA",
    purple: "#A78BFA",
    green: "#4ADE80",
    orange: "#FB923C",
    pink: "#F472B6",
    red: "#F87171",
    teal: "#2DD4BF",
  },
};

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
}

export const lightTheme: Theme = {
  dark: false,
  colors: lightColors,
  spacing,
  radius,
  fontSize,
};

export const darkTheme: Theme = {
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  fontSize,
};
