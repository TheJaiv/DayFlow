import { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Button, Card, Screen, Segmented } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { makeStyles, useTheme, type ThemeMode } from "@/theme";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const s = useStyles();
  const { user, signOut } = useAuth();
  const { mode, setMode, theme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // The auth gate notices the user is gone and redirects to /login.
    } finally {
      setSigningOut(false);
    }
  }

  const joined = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Settings</Text>

        <Text style={s.sectionLabel}>Account</Text>
        <Card style={{ marginBottom: 24 }}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Name</Text>
            <Text style={s.rowValue}>{user?.name ?? "—"}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Joined</Text>
            <Text style={s.rowValue}>{joined}</Text>
          </View>
        </Card>

        <Text style={s.sectionLabel}>Appearance</Text>
        <Card style={{ marginBottom: 24 }}>
          <Text style={s.cardHint}>
            System follows your device. Your choice is remembered on this device.
          </Text>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </Card>

        <Text style={s.sectionLabel}>Sync</Text>
        <Card style={{ marginBottom: 24 }}>
          <Text style={s.cardHint}>
            Everything is stored on the server and appears on any device you sign in
            on. Pull down on a list to force a refresh.
          </Text>
          <View style={s.row}>
            <Text style={s.rowLabel}>API</Text>
            <Text style={s.rowValueMono} numberOfLines={1}>
              {API_BASE_URL}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Platform</Text>
            <Text style={s.rowValue}>{Platform.OS}</Text>
          </View>
        </Card>

        <Button
          label="Sign out"
          variant="danger"
          onPress={handleSignOut}
          loading={signingOut}
        />

        <Text style={s.footer}>DayFlow · theme {theme.dark ? "dark" : "light"}</Text>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  content: {
    padding: t.spacing.lg,
    paddingBottom: t.spacing.xxl,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  heading: {
    fontSize: t.fontSize.xxl,
    fontWeight: "700",
    color: t.colors.text,
    letterSpacing: -0.5,
    marginTop: t.spacing.md,
    marginBottom: t.spacing.xl,
  },
  sectionLabel: {
    fontSize: t.fontSize.xs,
    fontWeight: "700",
    color: t.colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: t.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: t.spacing.sm,
    gap: t.spacing.lg,
  },
  rowLabel: { fontSize: t.fontSize.md, color: t.colors.textMuted },
  rowValue: { fontSize: t.fontSize.md, color: t.colors.text, flexShrink: 1 },
  rowValueMono: {
    fontSize: t.fontSize.sm,
    color: t.colors.text,
    flexShrink: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  divider: { height: 1, backgroundColor: t.colors.border },
  cardHint: {
    fontSize: t.fontSize.sm,
    color: t.colors.textMuted,
    marginBottom: t.spacing.md,
    lineHeight: 20,
  },
  footer: {
    textAlign: "center",
    color: t.colors.textFaint,
    fontSize: t.fontSize.xs,
    marginTop: t.spacing.xl,
  },
}));
