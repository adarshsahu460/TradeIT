import type { NextFunction, Request, Response } from "express";

import { getPrismaClient } from "../db";
import { verifyAccessToken } from "./tokenService";
import type { AuthenticatedUser } from "./types";

const prisma = getPrismaClient();

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ status: "error", message: "Missing authorization header" });
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(401).json({ status: "error", message: "Invalid token" });
    }

  req.user = user as AuthenticatedUser;
    return next();
  } catch (error) {
    return res.status(401).json({ status: "error", message: "Invalid or expired token" });
  }
};
