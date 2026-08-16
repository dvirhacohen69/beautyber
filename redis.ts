import Redis from "ioredis";
import { env } from "@config/env";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis =
  global.__redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
  });

if (env.NODE_ENV === "development") {
  global.__redis = redis;
}

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Redis connection error:", err.message);
});
