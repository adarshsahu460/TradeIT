import { getPrismaClient } from "../db";
import { hashValue, verifyHash } from "./hash";

const prisma = getPrismaClient();

export const storeRefreshToken = async (params: {
  userId: string;
  jti: string;
  token: string;
  expiresAt: Date;
}) => {
  const { userId, jti, token, expiresAt } = params;

  const tokenHash = await hashValue(token);

  await prisma.refreshToken.create({
    data: {
      userId,
      jti,
      tokenHash,
      expiresAt,
    },
  });
};

export const findRefreshToken = async (jti: string) =>
  prisma.refreshToken.findUnique({
    where: { jti },
  });

export const revokeRefreshToken = async (jti: string) =>
  prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const verifyStoredRefreshToken = async (jti: string, token: string) => {
  const record = await findRefreshToken(jti);
  if (!record) {
    return null;
  }

  if (record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const matches = await verifyHash(token, record.tokenHash);
  if (!matches) {
    return null;
  }

  return record;
};
