import { create } from "zustand";

type AuthUser = {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  token?: string;
};

type AuthState = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
};

const initialUser = (() => {
  const raw = localStorage.getItem("auth.user");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
})();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialUser,
  setUser: (user) => {
    if (user) {
      localStorage.setItem("auth.user", JSON.stringify(user));
    } else {
      localStorage.removeItem("auth.user");
    }
    set({ user });
  },
  logout: () => {
    localStorage.removeItem("auth.user");
    set({ user: null });
  },
}));
