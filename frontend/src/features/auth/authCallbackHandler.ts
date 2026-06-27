import { setApiAuthContext } from "../../services/apiClient";
import { useAuthStore } from "../../store/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type AuthPayload = {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  token: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

export function handleOAuthCallback(token: string): void {
  const payload = decodeJwtPayload(token);
  setApiAuthContext({ token });
  useAuthStore.getState().setUser({
    userId: payload.userId as string,
    email: payload.email as string,
    displayName: payload.displayName as string | undefined,
    avatarUrl: payload.avatarUrl as string | undefined,
    token,
  });
}

export async function initiateGoogleSignIn(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/google/login`);
  if (!response.ok) {
    throw new Error("Google OAuth is not available");
  }
  const data = (await response.json()) as { authorizeUrl: string };
  window.location.href = data.authorizeUrl;
}

export async function mockGoogleSignIn(email: string, displayName?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/google/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      googleSubjectId: `subject-${email}`,
      email,
      displayName: displayName ?? email.split("@")[0],
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to sign in");
  }

  const payload = (await response.json()) as AuthPayload;
  setApiAuthContext({ token: payload.token });
  useAuthStore.getState().setUser(payload);
}

export function signOut(): void {
  setApiAuthContext({ token: "" });
  useAuthStore.getState().setUser(null);
}
