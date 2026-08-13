import { createApp } from "./app";
import { env } from "./env";
import { prisma } from "./prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`DayFlow API listening on http://localhost:${env.PORT}`);
  console.log(`   env: ${env.NODE_ENV}`);
  console.log(`   cors: ${env.corsOrigins.join(", ") || "(none)"}`);
});

// Railway and Render send SIGTERM on redeploy. Draining in-flight requests and
// closing the pool avoids half-written responses and leaked connections.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
