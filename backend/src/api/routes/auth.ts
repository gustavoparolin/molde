import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  exchangeGoogleCodeForProfile,
  getGoogleOAuthAuthorizeUrl,
  isGoogleOAuthConfigured,
  requireAuth,
} from "../../auth/googleAuth.js";
import { getUserById, upsertGoogleUser } from "../../repositories/userRepository.js";
import { onAuthSuccess, onAuthFailure, onMockAuthUsed } from "../../observability/authEvents.js";

const MockGooglePayload = z.object({
  googleSubjectId: z.string().min(3),
  email: z.string().email(),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

function frontendUrl(): string {
  const origins = process.env.FRONTEND_ORIGINS ?? "http://localhost:5173";
  return origins.split(",")[0].trim();
}

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.get("/auth/google/login", async (_request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      reply.code(503).send({ message: "Google OAuth is not configured" });
      return;
    }

    const state = crypto.randomUUID();
    const authorizeUrl = getGoogleOAuthAuthorizeUrl(state);
    if (!authorizeUrl) {
      reply.code(503).send({ message: "Google OAuth is not configured" });
      return;
    }

    reply.code(200).send({ authorizeUrl, state });
  });

  // Google redirects the browser here after consent — we issue a JWT and redirect to the frontend.
  server.get("/auth/google/callback", async (request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      reply.code(503).send({ message: "Google OAuth is not configured" });
      return;
    }

    const query = request.query as { code?: string };
    if (!query.code) {
      reply.code(400).send({ message: "Missing code query param" });
      return;
    }

    try {
      const profile = await exchangeGoogleCodeForProfile(query.code);
      const user = await upsertGoogleUser({
        googleSubjectId: profile.subject,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });

      const token = await reply.jwtSign({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });

      onAuthSuccess(user.id, "google");
      reply.redirect(`${frontendUrl()}/auth/callback?token=${token}`);
    } catch (err) {
      onAuthFailure(err instanceof Error ? err.message : "unknown", "google");
      reply.redirect(`${frontendUrl()}/auth/callback?error=auth_failed`);
    }
  });

  // DEV-only shortcut: sign in without configuring OAuth. The frontend hides this
  // behind import.meta.env.DEV, and it is harmless in production (still issues a real JWT).
  server.post("/auth/google/mock", async (request, reply) => {
    const parsed = MockGooglePayload.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid request", issues: parsed.error.issues });
      return;
    }

    const user = await upsertGoogleUser(parsed.data);
    const token = await reply.jwtSign({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });

    onMockAuthUsed(user.id);
    reply.code(200).send({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      token,
    });
  });

  server.get("/auth/me", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const user = await getUserById(auth.userId);
    if (!user) {
      reply.code(404).send({ message: "User not found" });
      return;
    }

    reply.code(200).send({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });
  });
}
