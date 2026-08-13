import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/theme";

/* -------------------------------------------------------------- screen -- */

export function Screen({
  children,
  edges = ["top"],
}: {
  children: ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const s = useScreenStyles();
  return (
    <SafeAreaView style={s.root} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const useScreenStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
}));

/* ---------------------------------------------------------------- text -- */

export function Title({ children }: { children: ReactNode }) {
  const s = useTextStyles();
  return <Text style={s.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  const s = useTextStyles();
  return <Text style={s.subtitle}>{children}</Text>;
}

const useTextStyles = makeStyles((t) => ({
  title: {
    fontSize: t.fontSize.xxl,
    fontWeight: "700",
    color: t.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: t.fontSize.md,
    color: t.colors.textMuted,
    marginTop: t.spacing.xs,
  },
}));

/* -------------------------------------------------------------- button -- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const s = useButtonStyles();
  const { theme } = useTheme();
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        s.base,
        s[variant],
        pressed && !inactive && s.pressed,
        inactive && s.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? theme.colors.onAccent : theme.colors.accent}
        />
      ) : (
        <Text style={[s.label, s[`${variant}Label`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles((t) => ({
  base: {
    minHeight: 46,
    borderRadius: t.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: t.spacing.lg,
    flexDirection: "row",
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  label: { fontSize: t.fontSize.md, fontWeight: "600" },

  primary: { backgroundColor: t.colors.accent },
  primaryLabel: { color: t.colors.onAccent },

  secondary: {
    backgroundColor: t.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  secondaryLabel: { color: t.colors.text },

  ghost: { backgroundColor: "transparent" },
  ghostLabel: { color: t.colors.accent },

  danger: { backgroundColor: t.colors.dangerSoft },
  dangerLabel: { color: t.colors.danger },
}));

/* ----------------------------------------------------------- text field -- */

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const s = useFieldStyles();
  const { theme } = useTheme();

  return (
    <View style={s.wrapper}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        style={[s.input, !!error && s.inputError, props.style]}
        placeholderTextColor={theme.colors.textFaint}
        accessibilityLabel={label}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const useFieldStyles = makeStyles((t) => ({
  wrapper: { marginBottom: t.spacing.lg },
  label: {
    fontSize: t.fontSize.sm,
    fontWeight: "600",
    color: t.colors.textMuted,
    marginBottom: t.spacing.xs,
  },
  input: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.md,
    fontSize: t.fontSize.md,
    color: t.colors.text,
    minHeight: 46,
  },
  inputError: { borderColor: t.colors.danger },
  error: {
    fontSize: t.fontSize.sm,
    color: t.colors.danger,
    marginTop: t.spacing.xs,
  },
}));

/* ---------------------------------------------------------------- card -- */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const s = useCardStyles();
  return <View style={[s.card, style]}>{children}</View>;
}

const useCardStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
  },
}));

/* ------------------------------------------------------------- states -- */

export function LoadingState({ label = "Loading" }: { label?: string }) {
  const s = useStateStyles();
  const { theme } = useTheme();
  return (
    <View style={s.center}>
      <ActivityIndicator color={theme.colors.accent} />
      <Text style={s.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  const s = useStateStyles();
  return (
    <View style={s.center}>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!hint && <Text style={s.stateText}>{hint}</Text>}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const s = useStateStyles();
  return (
    <View style={s.center}>
      <Text style={s.errorTitle}>Something went wrong</Text>
      <Text style={s.stateText}>{message}</Text>
      {!!onRetry && (
        <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 16 }} />
      )}
    </View>
  );
}

/** Inline, non-blocking error -- used when a screen already has content. */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const s = useStateStyles();
  return (
    <Pressable onPress={onDismiss} style={s.banner} accessibilityRole="alert">
      <Text style={s.bannerText}>{message}</Text>
      {!!onDismiss && <Text style={s.bannerDismiss}>Dismiss</Text>}
    </Pressable>
  );
}

const useStateStyles = makeStyles((t) => ({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: t.spacing.xl,
    gap: t.spacing.sm,
  },
  stateText: {
    fontSize: t.fontSize.md,
    color: t.colors.textMuted,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: t.fontSize.lg,
    fontWeight: "600",
    color: t.colors.text,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: t.fontSize.lg,
    fontWeight: "600",
    color: t.colors.danger,
    textAlign: "center",
  },
  banner: {
    backgroundColor: t.colors.dangerSoft,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginHorizontal: t.spacing.lg,
    marginBottom: t.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.spacing.md,
  },
  bannerText: { color: t.colors.danger, fontSize: t.fontSize.sm, flex: 1 },
  bannerDismiss: { color: t.colors.danger, fontSize: t.fontSize.sm, fontWeight: "700" },
}));

/* --------------------------------------------------------------- sheet -- */

/** Bottom sheet used for every add/edit form. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const s = useSheetStyles();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTouch} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={s.close}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={s.body}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useSheetStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: "flex-end" },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: t.colors.bg,
    borderTopLeftRadius: t.radius.lg,
    borderTopRightRadius: t.radius.lg,
    maxHeight: "88%",
    paddingBottom: t.spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: t.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  title: { fontSize: t.fontSize.lg, fontWeight: "700", color: t.colors.text },
  close: { fontSize: t.fontSize.md, color: t.colors.accent, fontWeight: "600" },
  body: { padding: t.spacing.lg },
}));

/* --------------------------------------------------- segmented control -- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tint,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Optional per-option colour, e.g. priority pills. */
  tint?: (value: T) => string;
}) {
  const s = useSegmentedStyles();
  const { theme } = useTheme();

  return (
    <View style={s.row}>
      {options.map((option) => {
        const active = option.value === value;
        const accent = tint?.(option.value) ?? theme.colors.accent;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[s.item, active && { backgroundColor: accent, borderColor: accent }]}
          >
            <Text style={[s.label, active && { color: theme.colors.onAccent }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useSegmentedStyles = makeStyles((t) => ({
  row: { flexDirection: "row", gap: t.spacing.sm, flexWrap: "wrap" },
  item: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  label: { fontSize: t.fontSize.sm, fontWeight: "600", color: t.colors.textMuted },
}));
