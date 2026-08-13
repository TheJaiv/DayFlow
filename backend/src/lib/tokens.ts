import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { prisma } from "../prisma";

// Two-token scheme:
//
//   access token  - a short-lived JWT. Stateless, sent as `Authorization:
//                   Bearer`. Cannot be revoked, hence the short TTL.
//   refresh token - a 256-bit random string, NOT a JWT. The database is the
//                   source of truth for whether a session is still alive, so
//                   signing it would buy nothing; an opaque value keeps it
//                   from carrying stale claims. Only an HMAC of it is stored,
//                   so a database leak alone does not yield usable tokens.

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const options: jwt.SignOptions = {
    // ACCESS_TOKEN_TTL is a free-form string from env; the typings want a
    // narrow template literal like "15m", so widen it here at the boundary.
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "dayflow",
  };
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "dayflow",
  });
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Malformed access token payload");
  }
  return { sub: String(decoded.sub) };
}

function hashRefreshToken(token: string): string {
  return crypto
    .createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(token)
    .digest("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  );

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(token), expiresAt },
  });

  return token;
}

/**
 * Validates a refresh token and rotates it: the presented token is revoked and
 * a fresh one issued. Rotation means a stolen token is single-use, and reuse of
 * an already-revoked token is detectable.
 */
export async function rotateRefreshToken(
  token: string,
): Promise<{ userId: string; refreshToken: string } | null> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const refreshToken = await issueRefreshToken(record.userId);
  return { userId: record.userId, refreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const REFRESH_COOKIE = "dayflow_refresh";

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}
