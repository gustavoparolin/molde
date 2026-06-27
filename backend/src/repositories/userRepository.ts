import { isDatabaseConfigured, prisma } from "./db.js";

export type UserAccount = {
  id: string;
  googleSubjectId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

// In-memory fallback so the skeleton runs (mock login + CRUD) without a database.
const usersById = new Map<string, UserAccount>();
const usersByGoogleSubject = new Map<string, string>();

function mapUser(user: {
  id: string;
  googleSubjectId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserAccount {
  return {
    id: user.id,
    googleSubjectId: user.googleSubjectId,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function upsertGoogleUser(input: {
  googleSubjectId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<UserAccount> {
  if (!isDatabaseConfigured) {
    const existingId = usersByGoogleSubject.get(input.googleSubjectId);
    const now = new Date().toISOString();

    if (existingId) {
      const existing = usersById.get(existingId)!;
      existing.email = input.email;
      existing.displayName = input.displayName ?? existing.displayName;
      existing.avatarUrl = input.avatarUrl ?? existing.avatarUrl;
      existing.updatedAt = now;
      return existing;
    }

    const created: UserAccount = {
      id: crypto.randomUUID(),
      googleSubjectId: input.googleSubjectId,
      email: input.email,
      displayName: input.displayName ?? input.email.split("@")[0],
      avatarUrl: input.avatarUrl,
      createdAt: now,
      updatedAt: now,
    };

    usersById.set(created.id, created);
    usersByGoogleSubject.set(created.googleSubjectId, created.id);
    return created;
  }

  // Find by googleSubjectId OR email — handles migration from mock accounts (see molde-brain gotcha #1)
  const existing = await prisma.userAccount.findFirst({
    where: { OR: [{ googleSubjectId: input.googleSubjectId }, { email: input.email }] },
  });

  if (existing) {
    const updated = await prisma.userAccount.update({
      where: { id: existing.id },
      data: {
        googleSubjectId: input.googleSubjectId,
        email: input.email,
        displayName: input.displayName ?? existing.displayName,
        avatarUrl: input.avatarUrl ?? existing.avatarUrl,
      },
    });
    return mapUser(updated);
  }

  const created = await prisma.userAccount.create({
    data: {
      googleSubjectId: input.googleSubjectId,
      email: input.email,
      displayName: input.displayName ?? input.email.split("@")[0],
      avatarUrl: input.avatarUrl,
    },
  });

  return mapUser(created);
}

export async function getUserById(userId: string): Promise<UserAccount | undefined> {
  if (!isDatabaseConfigured) {
    return usersById.get(userId);
  }

  const user = await prisma.userAccount.findUnique({ where: { id: userId } });
  return user ? mapUser(user) : undefined;
}
