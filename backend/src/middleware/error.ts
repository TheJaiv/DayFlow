import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "../env";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Not authenticated", code = "UNAUTHENTICATED") {
    return new ApiError(401, message, code);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new ApiError(409, message, "CONFLICT");
  }
}

/**
 * Express 4 does not forward rejected promises to the error handler, so every
 * async route gets wrapped. Without this a failed await becomes an unhandled
 * rejection and the request hangs until it times out.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies error handlers by arity -- `next` must stay declared.
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body failed validation",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint violation, the only one reachable through
    // normal use (duplicate email on signup).
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "That value is already taken" },
      });
    }
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Not found" } });
    }
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      // Never leak stack traces to clients in production.
      ...(env.isProd ? {} : { debug: String(err) }),
    },
  });
}
