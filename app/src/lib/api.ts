import { Platform } from "react-native";
import Constants from "expo-constants";
import { KEYS, getItem, removeItem, setItem } from "./storage";

/* ----------------------------------------------------------- base URL ---- */

/**
 * Expo Go on a phone cannot reach "localhost" -- that resolves to the phone
 * itself, not the Mac running the API. Expo already knows the LAN address it
 * served the bundle from, so reuse its host and swap in the API port. This is
 * what makes iPhone testing work without editing a file every time the network
 * hands out a new IP.
 */
function inferBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  if (Platform.OS !== "web") {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
    const host = hostUri?.split(":")[0];
    if (host) return `http://${host}:4000`;
  }

  // On web, follow whatever host the page itself was served from. Hardcoding
  // localhost breaks the moment you open the dev server from another device:
  // "localhost" on an iPhone means the iPhone, not the Mac serving the app.
  if (Platform.OS === "web") {
    const host = globalThis.location?.hostname;
    const protocol = globalThis.location?.protocol ?? "http:";
    if (host) return `${protocol}//${host}:4000`;
  }

  return "http://localhost:4000";
}

export const API_BASE_URL = inferBaseUrl();

/* -------------------------------------------------------------- types ---- */

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: Priority;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimetableEvent {
  id: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  colorTag: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Streak {
  current: number;
  longest: number;
  completedToday: boolean;
  totalCompletions: number;
}

export interface GridDay {
  date: string;
  completed: boolean;
}

export interface Habit {
  id: string;
  name: string;
  frequency: "DAILY" | "WEEKDAYS";
  targetDays: number[];
  colorTag: string;
  archived: boolean;
  createdAt: string;
  streak: Streak;
  grid: GridDay[];
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the network never reached the server at all. */
  get isOffline() {
    return this.status === 0;
  }
}

/* ------------------------------------------------------------- client ---- */

type AuthLostHandler = () => void;

class ApiClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;
  private onAuthLost: AuthLostHandler | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  setAuthLostHandler(handler: AuthLostHandler | null) {
    this.onAuthLost = handler;
  }

  private async fetchRaw(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    // Tells the server to hand back a refresh token in the body rather than
    // setting a cookie, because native has no cookie jar we want to rely on.
    if (Platform.OS !== "web") headers["X-Client-Platform"] = "mobile";

    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Carries the httpOnly refresh cookie on web. Harmless on native.
      credentials: "include",
    });
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      throw new ApiError(
        res.status,
        payload?.error?.message ?? `Request failed (${res.status})`,
        payload?.error?.code,
        payload?.error?.details,
      );
    }

    return payload as T;
  }

  /**
   * Exchanges the refresh token for a new access token. Collapsed into a
   * single in-flight promise: when four screens load at once and all four get
   * a 401, they must not fire four rotations -- rotation invalidates the
   * previous token, so the losers would log the user out.
   */
  private async refresh(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const stored =
        Platform.OS === "web" ? undefined : await getItem(KEYS.refreshToken);

      // On web the cookie travels automatically; on native we must present it.
      if (Platform.OS !== "web" && !stored) return false;

      const res = await this.fetchRaw(
        "POST",
        "/auth/refresh",
        Platform.OS === "web" ? {} : { refreshToken: stored },
      );

      if (!res.ok) return false;

      const data = (await res.json()) as {
        accessToken: string;
        refreshToken?: string;
      };
      this.accessToken = data.accessToken;
      if (data.refreshToken) {
        await setItem(KEYS.refreshToken, data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchRaw(method, path, body);
    } catch {
      throw new ApiError(0, "Can't reach the server. Check your connection.");
    }

    // A 401 on a normal call means the 15-minute access token aged out. Try
    // exactly one silent refresh-and-retry before giving up on the session.
    if (res.status === 401 && !path.startsWith("/auth/")) {
      const refreshed = await this.refresh();
      if (refreshed) {
        try {
          res = await this.fetchRaw(method, path, body);
        } catch {
          throw new ApiError(0, "Can't reach the server. Check your connection.");
        }
      } else {
        this.accessToken = null;
        await removeItem(KEYS.refreshToken);
        this.onAuthLost?.();
        throw new ApiError(401, "Your session expired. Please sign in again.");
      }
    }

    return this.parse<T>(res);
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body ?? {});
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }

  /** Restores a session on cold start. Returns null when there is none. */
  async bootstrap(): Promise<User | null> {
    const refreshed = await this.refresh();
    if (!refreshed) return null;
    try {
      const { user } = await this.get<{ user: User }>("/auth/me");
      return user;
    } catch {
      return null;
    }
  }
}

export const api = new ApiClient();

/* ---------------------------------------------------------- endpoints ---- */

export const authApi = {
  async signup(email: string, password: string, name: string) {
    const data = await api.request<{
      user: User;
      accessToken: string;
      refreshToken?: string;
    }>("POST", "/auth/signup", { email, password, name });
    api.setAccessToken(data.accessToken);
    if (data.refreshToken) await setItem(KEYS.refreshToken, data.refreshToken);
    return data.user;
  },

  async login(email: string, password: string) {
    const data = await api.request<{
      user: User;
      accessToken: string;
      refreshToken?: string;
    }>("POST", "/auth/login", { email, password });
    api.setAccessToken(data.accessToken);
    if (data.refreshToken) await setItem(KEYS.refreshToken, data.refreshToken);
    return data.user;
  },

  async logout() {
    const stored = await getItem(KEYS.refreshToken);
    try {
      await api.request("POST", "/auth/logout", stored ? { refreshToken: stored } : {});
    } catch {
      // A failed logout call must not trap the user in a signed-in shell --
      // the local session is cleared either way.
    }
    api.setAccessToken(null);
    await removeItem(KEYS.refreshToken);
  },
};

export const tasksApi = {
  list: () => api.get<{ tasks: Task[] }>("/tasks").then((r) => r.tasks),
  create: (input: {
    title: string;
    notes?: string | null;
    dueDate?: string | null;
    priority?: Priority;
  }) => api.post<{ task: Task }>("/tasks", input).then((r) => r.task),
  update: (
    id: string,
    patch: Partial<{
      title: string;
      notes: string | null;
      dueDate: string | null;
      priority: Priority;
      completed: boolean;
    }>,
  ) => api.patch<{ task: Task }>(`/tasks/${id}`, patch).then((r) => r.task),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),
};

export const timetableApi = {
  listForDate: (date: string) =>
    api
      .get<{ events: TimetableEvent[] }>(`/timetable?date=${date}`)
      .then((r) => r.events),
  listRange: (from: string, to: string) =>
    api
      .get<{ events: TimetableEvent[] }>(`/timetable?from=${from}&to=${to}`)
      .then((r) => r.events),
  create: (input: {
    title: string;
    date: string;
    startMinute: number;
    endMinute: number;
    colorTag?: string;
    notes?: string | null;
  }) => api.post<{ event: TimetableEvent }>("/timetable", input).then((r) => r.event),
  update: (
    id: string,
    patch: Partial<{
      title: string;
      date: string;
      startMinute: number;
      endMinute: number;
      colorTag: string;
      notes: string | null;
    }>,
  ) =>
    api
      .patch<{ event: TimetableEvent }>(`/timetable/${id}`, patch)
      .then((r) => r.event),
  remove: (id: string) => api.delete<void>(`/timetable/${id}`),
};

export const habitsApi = {
  list: (today: string) =>
    api.get<{ today: string; habits: Habit[] }>(`/habits?today=${today}`).then((r) => r.habits),
  create: (input: { name: string; colorTag?: string }) =>
    api.post<{ habit: Habit }>("/habits", input).then((r) => r.habit),
  update: (id: string, patch: Partial<{ name: string; colorTag: string; archived: boolean }>) =>
    api.patch<{ habit: Habit }>(`/habits/${id}`, patch).then((r) => r.habit),
  remove: (id: string) => api.delete<void>(`/habits/${id}`),
  toggle: (id: string, date: string, today: string, completed?: boolean) =>
    api.post<{ log: GridDay; streak: Streak; grid: GridDay[] }>(`/habits/${id}/log`, {
      date,
      today,
      ...(completed === undefined ? {} : { completed }),
    }),
};
