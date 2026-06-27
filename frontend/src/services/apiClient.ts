const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type AuthContext = {
  token?: string;
};

let authContext: AuthContext = {
  token: localStorage.getItem("auth.token") ?? undefined,
};

export function setApiAuthContext(next: AuthContext): void {
  authContext = { ...authContext, ...next };

  if (next.token !== undefined) {
    if (next.token) {
      localStorage.setItem("auth.token", next.token);
    } else {
      localStorage.removeItem("auth.token");
    }
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(authContext.token ? { Authorization: `Bearer ${authContext.token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    // Token invalid or expired — force logout
    const { useAuthStore } = await import("../store/authStore");
    setApiAuthContext({ token: "" });
    useAuthStore.getState().logout();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
