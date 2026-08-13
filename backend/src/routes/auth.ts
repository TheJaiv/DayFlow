import { Router, type Request, type Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword, verifyPassword, fakeVerify } from "../lib/password";
import {
  REFRESH_COOKIE,
  issueRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../lib/tokens";
import { publicUser } from "../lib/serialize";
import { ApiError, asyncHandler } from "../middleware/error";
import { requireAuth, userIdOf } from "../middleware/auth";
import { loginSchema, signupSchema } from "../schemas";

export const authRouter = Router();

/**
 * Web and mobile store the refresh token differently, so the client says which
 * it is. Web gets an httpOnly cookie that JavaScript cannot read, which is the
 * whole point -- an XSS bug should not be able to walk off with a 30-day
 * session. Native has no cookie jar worth trusting, so it receives the token in
 * the response body and puts it in SecureStore (Keychain / Keystore).
 */
function isMobileClient(req: Request): boolean {
  return req.header("x-client-platform")?.toLowerCase() === "mobile";
}

async function establishSession(
  req: Request,
  res: Response,
  user: User,
  status: number,
) {
  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  const body: Record<string, unknown> = {
    user: publicUser(user),
    accessToken,
  };

  if (isMobileClient(req)) {
    body.refreshToken = refreshToken;
  } else {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  }

  res.status(status).json(body);
}

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, name } = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.conflict("An account with that email already exists");
    }

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });

    await establishSession(req, res, user, 201);
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // passwordHash is null for a future Google-only account -- such a user
    // cannot log in this way, and must not be told the account exists.
    if (!user || !user.passwordHash) {
      await fakeVerify();
      throw ApiError.unauthorized("Incorrect email or password", "BAD_CREDENTIALS");
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.unauthorized("Incorrect email or password", "BAD_CREDENTIALS");
    }

    await establishSession(req, res, user, 200);
  }),
);

/**
 * Not in the original endpoint list, but the two-token scheme is inert without
 * it: access tokens expire after 15 minutes, and with no way to trade a
 * refresh token for a new one the user would be logged out mid-sentence.
 */
authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const presented: unknown =
      req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;

    if (typeof presented !== "string" || !presented) {
      throw ApiError.unauthorized("No refresh token provided", "REFRESH_MISSING");
    }

    const rotated = await rotateRefreshToken(presented);
    if (!rotated) {
      // Expired, already used, or forged. Clear the cookie so the browser
      // stops replaying a token that will never work again.
      res.clearCookie(REFRESH_COOKIE, { path: "/auth" });
      throw ApiError.unauthorized("Refresh token is invalid", "REFRESH_INVALID");
    }

    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) throw ApiError.unauthorized("Account no longer exists");

    const body: Record<string, unknown> = {
      user: publicUser(user),
      accessToken: signAccessToken(user.id),
    };

    if (isMobileClient(req)) {
      body.refreshToken = rotated.refreshToken;
    } else {
      res.cookie(REFRESH_COOKIE, rotated.refreshToken, refreshCookieOptions());
    }

    res.json(body);
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const presented: unknown =
      req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;

    // Revoking server-side is what makes logout real. Dropping the token on
    // the client alone would leave a valid 30-day session in the database.
    if (typeof presented === "string" && presented) {
      await revokeRefreshToken(presented);
    }

    res.clearCookie(REFRESH_COOKIE, { path: "/auth" });
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userIdOf(req) } });
    if (!user) throw ApiError.unauthorized("Account no longer exists");
    res.json({ user: publicUser(user) });
  }),
);
