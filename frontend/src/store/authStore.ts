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

// REGRA DA "QUARTA PORTA" (inspection do Cota4, 2026-08-15, F-01 — field-note do Molde).
// Este skeleton é user único e não tem store de tenant nem rascunho persistido, então
// não há o que limpar aqui HOJE. Mas no dia em que o app ganhar Empresa/tenant,
// impersonation ou draft em localStorage, vale isto:
//   1. UM único `limparStoresDeTenant()` (reset dos stores de domínio + remoção das
//      chaves persistidas), e nunca uma limpeza espalhada por porta.
//   2. TODA porta que recebe token novo chama esse reset ANTES de qualquer `/auth/me`:
//      callback OAuth, deep link (Capacitor volta SEM reload), mock, demo, magic link,
//      impersonar/sair, logout. A porta que esquece é sempre a que nasce depois — no
//      Cota4 foi `entrarComToken`, e o formulário da empresa A foi salvo na linha da B
//      (RLS acertou a linha; o formulário não). Reload não protege: o boot rehidrata o
//      rascunho sob a sessão ANTERIOR, porque a sessão só muda depois do /auth/me.
//   3. Órfão se descarta, não se adota: rascunho sem `empresaId` da sessão atual é lixo.
//   4. O teste da quarta porta nasce junto: sessão A + rascunho de A → token de B →
//      rascunho vazio em memória E no storage (receita em field-note 2026-08-15).
// `setUser` é a única porta deste skeleton (OAuth callback e mock passam por aqui) —
// mantenha assim: porta nova de token entra por `setUser`, e `setUser` chama o reset.
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
