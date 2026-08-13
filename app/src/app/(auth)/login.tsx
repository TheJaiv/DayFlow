import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Button, Screen, Subtitle, TextField, Title } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { makeStyles } from "@/theme";

export default function LoginScreen() {
  const s = useStyles();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setFieldErrors({});

    // Cheap client-side checks first so an obviously empty form does not need
    // a round trip; the server validates everything again regardless.
    if (!email.trim() || !password) {
      setFieldErrors({
        ...(email.trim() ? {} : { email: "Email is required" }),
        ...(password ? {} : { password: "Password is required" }),
      });
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // No navigation here -- the auth gate in the root layout reacts to the
      // user appearing and redirects, which keeps one source of truth.
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          setFieldErrors(
            Object.fromEntries(err.details.map((d) => [d.field, d.message])),
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Title>DayFlow</Title>
            <Subtitle>Your tasks, timetable and habits in one place.</Subtitle>
          </View>

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            returnKeyType="next"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Your password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <Button label="Sign in" onPress={onSubmit} loading={submitting} />

          <View style={s.footer}>
            <Text style={s.footerText}>New here?</Text>
            <Link href="/signup" asChild>
              <Pressable hitSlop={8}>
                <Text style={s.link}>Create an account</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: t.spacing.xl,
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },
  header: { marginBottom: t.spacing.xxl },
  error: {
    color: t.colors.danger,
    fontSize: t.fontSize.sm,
    marginBottom: t.spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: t.spacing.xs,
    marginTop: t.spacing.xl,
  },
  footerText: { color: t.colors.textMuted, fontSize: t.fontSize.md },
  link: { color: t.colors.accent, fontSize: t.fontSize.md, fontWeight: "600" },
}));
