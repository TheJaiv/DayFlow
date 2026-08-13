import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env";
import { prisma } from "./prisma";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { tasksRouter } from "./routes/tasks";
import { timetableRouter } from "./routes/timetable";
import { habitsRouter } from "./routes/habits";

/**
 * True for origins on a LAN: 10.x, 172.16-31.x, 192.168.x, or *.local.
 * Used only in development -- see the CORS handler below.
 */
function isPrivateNetworkOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (hostname === "localhost" || hostname.endsWith(".local")) return true;

  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header means a native app, a server-to-server call or
        // curl -- none of which the same-origin policy protects anyway, so
        // there is nothing to gain by blocking them.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);

        // In development only, accept any private-network origin. Testing on a
        // phone means loading the app from the Mac's LAN address, and that
        // address changes whenever the router hands out a new lease -- pinning
        // it in .env turns into a chore. Never enabled in production, where the
        // allowlist is the whole point.
        if (!env.isProd && isPrivateNetworkOrigin(origin)) {
          return callback(null, true);
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      // Required for the refresh cookie to travel on web.
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Client-Platform"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Liveness only: is the process up? Deliberately touches nothing, so it
  // stays fast and cannot fail because of a database blip.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "dayflow-api", env: env.NODE_ENV });
  });

  // Readiness: proves the database is actually reachable, AND counts as
  // database activity.
  //
  // That second part matters on free hosting. Supabase pauses a project after
  // 7 days with no database queries, and an uptime monitor pointed at /health
  // would never touch Postgres -- so the API would stay warm while the
  // database underneath it quietly shut off. Point the monitor here instead
  // and one ping keeps both alive.
  app.get("/health/db", async (_req, res) => {
    const startedAt = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        service: "dayflow-api",
        database: "reachable",
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      // 503 rather than 500: the monitor should read this as "down", and a
      // load balancer should stop sending traffic here.
      res.status(503).json({
        ok: false,
        database: "unreachable",
        error: env.isProd ? undefined : String(err),
      });
    }
  });

  app.use("/auth", authRouter);

  // requireAuth is mounted on the routers rather than inside each handler, so
  // a newly added route is protected by default instead of by remembering to.
  app.use("/tasks", requireAuth, tasksRouter);
  app.use("/timetable", requireAuth, timetableRouter);
  app.use("/habits", requireAuth, habitsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
