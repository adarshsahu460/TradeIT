import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "tradeit.auth";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  authorizedFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readPersistedSession = (): AuthSession | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AuthSession;
  } catch (error) {
    console.warn("Failed to read persisted auth session", error);
    return null;
  }
};

const writePersistedSession = (session: AuthSession | null) => {
  try {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn("Failed to persist auth session", error);
  }
};

const authenticate = async (path: string, body: Credentials) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message ?? "Authentication failed";
    throw new Error(message);
  }

  const data = (await response.json()) as AuthSession;
  return data;
};

const sendAuthenticatedRequest = async (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, {
    ...init,
    credentials: "include",
  });

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const persisted = typeof window !== "undefined" ? readPersistedSession() : null;
  const [user, setUser] = useState<AuthUser | null>(persisted?.user ?? null);
  const [accessToken, setAccessToken] = useState<string | null>(persisted?.accessToken ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useCallback((session: AuthSession | null) => {
    setUser(session?.user ?? null);
    setAccessToken(session?.accessToken ?? null);
    writePersistedSession(session);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await sendAuthenticatedRequest(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
      });

      if (!response.ok) {
        setSession(null);
        return null;
      }

      const data = (await response.json()) as AuthSession;
      setSession(data);
      return data.accessToken;
    } catch (err) {
      console.error("Failed to refresh session", err);
      setSession(null);
      return null;
    }
  }, [setSession]);

  const login = useCallback(
    async (credentials: Credentials) => {
      setLoading(true);
      setError(null);
      try {
        const session = await authenticate("login", credentials);
        setSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to login";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  const register = useCallback(
    async (credentials: Credentials) => {
      setLoading(true);
      setError(null);
      try {
        const session = await authenticate("register", credentials);
        setSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to register";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await sendAuthenticatedRequest(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to logout", err);
    } finally {
      setSession(null);
    }
  }, [setSession]);

  const authorizedFetch = useCallback<NonNullable<AuthContextValue["authorizedFetch"]>>(async (input, init) => {
    const performRequest = async (token: string) => {
      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, {
        ...init,
        headers,
        credentials: "include",
      });
    };

    if (!accessToken) {
      const token = await refresh();
      if (!token) {
        throw new Error("Not authenticated");
      }
      return performRequest(token);
    }

    let response = await performRequest(accessToken);
    if (response.status === 401) {
      const token = await refresh();
      if (!token) {
        throw new Error("Session expired");
      }
      response = await performRequest(token);
    }

    return response;
  }, [accessToken, refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      loading,
      error,
      login,
      register,
      logout,
      refresh,
      authorizedFetch,
    }),
    [accessToken, authorizedFetch, error, loading, login, logout, refresh, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
