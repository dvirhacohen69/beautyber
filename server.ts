import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app";
import { env } from "@config/env";
import { prisma } from "@database/prisma";
import { redis } from "@database/redis";
import { registerTrackingGateway } from "@modules/tracking/gateway/tracking.gateway";

async function bootstrap() {
  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });
  registerTrackingGateway(io);

  const server = httpServer.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 Server running on http://localhost:${env.PORT}${env.API_BASE_PATH}`);
    // eslint-disable-next-line no-console
    console.log(`📡 WebSocket tracking gateway ready at ws://localhost:${env.PORT}/ws/tracking/{bookingId}`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received. Shutting down gracefully...`);
    io.close();
    server.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
