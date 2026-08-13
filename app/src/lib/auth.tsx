import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, authApi, type User } from "./api";

interface AuthContextValue {
  user: User | null;
  /** True until the cold-start session check finishes. */
  initialising: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  // On launch, try to turn a stored refresh token (or the web cookie) back
  // into a live session. This is what makes the app open straight to the
  // user's data on a new device after they log in once.
  useEffect(() => {
    let cancelled = false;
    api
      .bootstrap()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The client calls this when a refresh fails mid-session, so an expired
  // session drops the user to the login screen instead of leaving a shell of
  // empty screens throwing 401s.
  useEffect(() => {
    api.setAuthLostHandler(() => setUser(null));
    return () => api.setAuthLostHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password));
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      setUser(await authApi.signup(email, password, name));
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initialising, signIn, signUp, signOut }),
    [user, initialising, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
