import { useState, useEffect, useCallback } from "react";

interface AuthUser {
  id: string;
  username: string;
  role: "adm" | "user";
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true, error: null });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const user = await res.json();
        setState({ user, isLoading: false, error: null });
      } else {
        setState({ user: null, isLoading: false, error: null });
      }
    } catch {
      setState({ user: null, isLoading: false, error: null });
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (username: string, password: string): Promise<boolean> => {
    setState((s) => ({ ...s, error: null }));
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const user = await res.json();
        setState({ user, isLoading: false, error: null });
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, error: data.error || "Invalid credentials" }));
      return false;
    } catch {
      setState((s) => ({ ...s, error: "Connection error" }));
      return false;
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setState({ user: null, isLoading: false, error: null });
  };

  return { ...state, login, logout, refetch: fetchMe };
}
