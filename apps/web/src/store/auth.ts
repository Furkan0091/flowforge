import { create } from "zustand";
import { api, getToken, setToken } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  load: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  status: "loading",

  login: async (email, password) => {
    const { token, user } = await api.auth.login({ email, password });
    setToken(token);
    set({ user, token, status: "authenticated" });
  },

  register: async (email, password, name) => {
    const { token, user } = await api.auth.register({ email, password, name });
    setToken(token);
    set({ user, token, status: "authenticated" });
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore network errors on logout
    }
    setToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },

  load: async () => {
    if (!getToken()) {
      set({ status: "unauthenticated" });
      return;
    }
    try {
      const { user } = await api.auth.me();
      set({ user, status: "authenticated" });
    } catch {
      setToken(null);
      set({ user: null, token: null, status: "unauthenticated" });
    }
  },
}));
