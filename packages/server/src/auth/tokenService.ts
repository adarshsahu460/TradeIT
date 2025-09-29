import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";

import { config } from "../config";
import type { AuthenticatedUser } from "./types";

interface BaseTokenPayload {
  sub: string;
  email: string;
  jti: string;
  tokenType: "access" | "refresh";
}

export interface AccessTokenPayload extends BaseTokenPayload {
  tokenType: "access";
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  tokenType: "refresh";
}

const parseExpiration = (token: string) => {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object" || !("exp" in decoded)) {
    throw new Error("Failed to decode JWT expiration");
  }

  return new Date((decoded.exp as number) * 1000);
};

export const createAccessToken = (user: AuthenticatedUser) => {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    jti: randomUUID(),
    tokenType: "access",
  };

  const secret: Secret = config.jwtAccessSecret;

  const options: SignOptions = {
    expiresIn: config.jwtAccessExpiresIn as StringValue,
    issuer: "tradeit",
  };

  return jwt.sign(payload, secret, options);
};

export const createRefreshToken = (user: AuthenticatedUser) => {
  const payload: RefreshTokenPayload = {
    sub: user.id,
    email: user.email,
    jti: randomUUID(),
    tokenType: "refresh",
  };

  const secret: Secret = config.jwtRefreshSecret;

  const options: SignOptions = {
    expiresIn: config.jwtRefreshExpiresIn as StringValue,
    issuer: "tradeit",
  };

  const token = jwt.sign(payload, secret, options);

  return {
    token,
    payload,
    expiresAt: parseExpiration(token),
  };
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const secret: Secret = config.jwtAccessSecret;
  const payload = jwt.verify(token, secret, { issuer: "tradeit" });
  if (!payload || typeof payload !== "object" || (payload as BaseTokenPayload).tokenType !== "access") {
    throw new Error("Invalid access token");
  }
  return payload as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const secret: Secret = config.jwtRefreshSecret;
  const payload = jwt.verify(token, secret, { issuer: "tradeit" });
  if (!payload || typeof payload !== "object" || (payload as BaseTokenPayload).tokenType !== "refresh") {
    throw new Error("Invalid refresh token");
  }
  return payload as RefreshTokenPayload;
};
