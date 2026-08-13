import "@/global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoadingState, Screen } from "@/components/ui";
import { ThemeProvider, useTheme } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * The auth gate. Redirects rather than conditionally rendering two different
 * navigators, so that deep links (and the browser back button on web) keep
 * working instead of landing on a route that has been unmounted.
 */
function RootNavigator() {
  const { user, initialising } = useAuth();
  const { theme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait for the cold-start session check, otherwise a returning user is
    // bounced to /login for a frame before their session restores.
    if (initialising) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/");
    }
  }, [user, initialising, segments, router]);

  if (initialising) {
    return (
      <Screen>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <LoadingState label="Restoring your session" />
      </Screen>
    );
  }

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    </>
  );
}
