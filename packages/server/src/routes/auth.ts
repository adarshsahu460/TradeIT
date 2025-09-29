import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { getPrismaClient } from "../db";
import { config } from "../config";
import { hashPassword, verifyPassword } from "../auth/hash";
import { authenticate } from "../auth/middleware";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../auth/tokenService";
import {
  revokeRefreshToken,
  storeRefreshToken,
  verifyStoredRefreshToken,
} from "../auth/refreshTokenService";
import type { AuthenticatedUser } from "../auth/types";
import { logger } from "../logger";

const router = Router();
const prisma = getPrismaClient();

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
});

type Credentials = z.infer<typeof credentialsSchema>;

const setRefreshTokenCookie = (res: Response, token: string, expiresAt: Date) => {
  res.cookie(config.refreshTokenCookieName, token, {
    httpOnly: true,
    secure: config.refreshTokenCookieSecure,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
};

const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie(config.refreshTokenCookieName, {
    httpOnly: true,
    secure: config.refreshTokenCookieSecure,
    sameSite: "lax",
    path: "/",
  });
};

const buildAuthenticatedResponse = async (user: AuthenticatedUser, res: Response) => {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  await storeRefreshToken({
    userId: user.id,
    jti: refreshToken.payload.jti,
    token: refreshToken.token,
    expiresAt: refreshToken.expiresAt,
  });

  setRefreshTokenCookie(res, refreshToken.token, refreshToken.expiresAt);

  return {
    user,
    accessToken,
  };
};

router.post("/register", async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "error", errors: parsed.error.format() });
  }

  const { email, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({ status: "error", message: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);

  const createdUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
    },
    select: { id: true, email: true },
  });

  const payload = await buildAuthenticatedResponse(createdUser, res);
  return res.status(201).json(payload);
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: "error", errors: parsed.error.format() });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ status: "error", message: "Invalid credentials" });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ status: "error", message: "Invalid credentials" });
  }

  const payload = await buildAuthenticatedResponse({ id: user.id, email: user.email }, res);
  return res.json(payload);
});

router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.[config.refreshTokenCookieName];
  if (!token) {
    return res.status(401).json({ status: "error", message: "Missing refresh token" });
  }

  try {
    const payload = verifyRefreshToken(token);
    const stored = await verifyStoredRefreshToken(payload.jti, token);

    if (!stored) {
      return res.status(401).json({ status: "error", message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user) {
      await revokeRefreshToken(payload.jti);
      return res.status(401).json({ status: "error", message: "Invalid refresh token" });
    }

    await revokeRefreshToken(payload.jti);

    const response = await buildAuthenticatedResponse(user, res);
    return res.json(response);
  } catch (error) {
    logger.warn({ error }, "Failed to refresh token");
    return res.status(401).json({ status: "error", message: "Invalid refresh token" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.[config.refreshTokenCookieName];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await revokeRefreshToken(payload.jti);
    } catch (error) {
      logger.warn({ error }, "Failed to revoke refresh token");
    }
  }

  clearRefreshTokenCookie(res);
  return res.status(204).send();
});

router.get("/me", authenticate, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  return res.json({ user: req.user });
});

export { router as authRouter };
