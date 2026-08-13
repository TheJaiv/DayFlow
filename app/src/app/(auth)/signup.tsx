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

export default function SignupScreen() {
  const s = useStyles();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setFieldErrors({});

    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Name is required";
    if (!email.trim()) local.email = "Email is required";
    // Mirrors the server's rule so the failure is instant rather than a round
    // trip. The server still enforces it.
    if (password.length < 8) local.password = "Use at least 8 characters";

    if (Object.keys(local).length) {
      setFieldErrors(local);
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email.trim(), password, name.trim());
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
            <Title>Create account</Title>
            <Subtitle>It syncs to every device you sign in on.</Subtitle>
          </View>

          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            error={fieldErrors.name}
            autoComplete="name"
            placeholder="Jaiv"
          />

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
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 8 characters"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <Button label="Create account" onPress={onSubmit} loading={submitting} />

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <Link href="/login" asChild>
              <Pressable hitSlop={8}>
                <Text style={s.link}>Sign in</Text>
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
