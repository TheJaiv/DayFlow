import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// One key-value API over two very different stores.
//
// Native uses SecureStore, which is backed by the iOS Keychain and Android
// Keystore -- the right place for a 30-day refresh token.
//
// Web deliberately does NOT store the refresh token at all: it lives in an
// httpOnly cookie the browser attaches automatically and JavaScript cannot
// read, so an XSS bug cannot walk off with the session. localStorage here only
// ever holds non-sensitive UI preferences.

const isWeb = Platform.OS === "web";

// SecureStore rejects keys containing anything but alphanumerics, ".", "-", "_".
function assertValidKey(key: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export async function getItem(key: string): Promise<string | null> {
  assertValidKey(key);
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // Safari private mode throws on localStorage access.
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  assertValidKey(key);
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  assertValidKey(key);
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const KEYS = {
  refreshToken: "dayflow.refreshToken",
  themeMode: "dayflow.themeMode",
} as const;
