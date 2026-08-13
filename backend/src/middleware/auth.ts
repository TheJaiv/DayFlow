import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { ApiError } from "./error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Gate for every data route. Rejects the request unless it carries a valid,
 * unexpired access token, and stashes the owning user id on the request.
 *
 * Nothing downstream should ever read a user id from the body or the query
 * string -- if it did, any authenticated user could name someone else's id and
 * read their data. `req.userId` set here is the single source of ownership.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(
      ApiError.unauthorized("Missing Authorization header", "TOKEN_MISSING"),
    );
  }

  try {
    const { sub } = verifyAccessToken(header.slice("Bearer ".length).trim());
    req.userId = sub;
    next();
  } catch {
    // Distinct code so the client knows to try /auth/refresh rather than
    // bouncing the user straight to the login screen.
    next(ApiError.unauthorized("Invalid or expired token", "TOKEN_INVALID"));
  }
}

/** Narrows `req.userId` to a string for handlers that run behind requireAuth. */
export function userIdOf(req: Request): string {
  if (!req.userId) {
    throw new ApiError(500, "userIdOf called outside requireAuth", "INTERNAL_ERROR");
  }
  return req.userId;
}
