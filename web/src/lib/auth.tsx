"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { post, refreshSession, sessionUser, setAccessToken, setOnAuthLost, setSessionUser } from "./api";
import type { Me } from "./types";

type AuthState = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOnAuthLost(() => {
      setAccessToken(null);
      setUser(null);
    });
    refreshSession().then((ok) => {
      if (ok) setUser(sessionUser as Me);
      setLoading(false);
    });
    // Proactively refresh before the 15-minute access token expires.
    const id = setInterval(() => {
      refreshSession().then((ok) => ok && setUser(sessionUser as Me));
    }, 12 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ access_token: string; user: Me }>("/api/auth/login", { email, password });
    setAccessToken(r.access_token);
    setSessionUser(r.user);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await post("/api/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const can = useCallback((perm: string) => !!user?.permissions.includes(perm), [user]);

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
