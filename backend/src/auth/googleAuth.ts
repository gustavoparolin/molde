import type { FastifyReply, FastifyRequest } from "fastify";
import { setCurrentUser } from "./requestContext.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; email: string; displayName?: string; avatarUrl?: string };
    user: { userId: string; email: string; displayName?: string; avatarUrl?: string };
  }
}

export type AuthUser = {
  userId: string;
  email: string;
};

export type GoogleOAuthProfile = {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
};

export function isGoogleOAuthConfigured(): boolean {
  return (
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleOAuthAuthorizeUrl(state: string): string | undefined {
  if (!isGoogleOAuthConfigured()) {
    return undefined;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCodeForProfile(code: string): Promise<GoogleOAuthProfile> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error("Google OAuth is not configured");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Failed to exchange Google OAuth code");
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("Google token response missing access_token");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  if (!profileResponse.ok) {
    throw new Error("Failed to fetch Google user profile");
  }

  const profile = (await profileResponse.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  return {
    subject: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified ?? false,
    displayName: profile.name,
    avatarUrl: profile.picture,
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | undefined> {
  try {
    await request.jwtVerify();
    const user = { userId: request.user.userId, email: request.user.email };
    // Populate AsyncLocalStorage for the current request scope so the Prisma
    // extension can set createdBy/updatedBy without changing call sites.
    setCurrentUser(user.userId);
    return user;
  } catch {
    reply.code(401).send({ message: "Unauthorized" });
    return undefined;
  }
}
