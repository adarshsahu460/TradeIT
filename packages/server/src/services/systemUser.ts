import { hashPassword } from "../auth/hash";
import { getPrismaClient } from "../db";

const creationPromises = new Map<string, Promise<string>>();

const DEFAULT_PASSWORD = "system-user-password";

export const ensureSystemUser = (email: string): Promise<string> => {
  if (creationPromises.has(email)) {
    return creationPromises.get(email)!;
  }

  const promise = (async () => {
    const prisma = getPrismaClient();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return existing.id;
    }

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return created.id;
  })();

  creationPromises.set(email, promise);
  return promise;
};