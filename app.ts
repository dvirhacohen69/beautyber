import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "@config/env";
import { authRouter } from "@modules/auth/routes/auth.routes";
import { bookingRouter } from "@modules/bookings/routes/booking.routes";
import { trackingRouter } from "@modules/tracking/routes/tracking.routes";
import { categoryRouter } from "@modules/categories/routes/category.routes";
import { providerRouter } from "@modules/providers/routes/provider.routes";
import { userRouter } from "@modules/users/routes/user.routes";
import { errorHandler } from "@modules/common/middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(
    pinoHttp({
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization"], // לא לרשום טוקנים ללוג
    })
  );

  // Health check — לשימוש ע"י Load Balancer / Docker healthcheck
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ---- Module Routers ----
  app.use(`${env.API_BASE_PATH}/auth`, authRouter);
  app.use(`${env.API_BASE_PATH}/bookings`, bookingRouter);
  app.use(`${env.API_BASE_PATH}/tracking`, trackingRouter);
  app.use(`${env.API_BASE_PATH}/categories`, categoryRouter);
  app.use(`${env.API_BASE_PATH}/providers`, providerRouter);
  app.use(`${env.API_BASE_PATH}/users`, userRouter);
  // המודולים הבאים (payments, admin, reviews, notifications...)
  // יחוברו כאן באותה תבנית בחלקים הבאים.

  // 404 עבור נתיב לא קיים
  app.use((req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
    });
  });

  // Error handler — **תמיד אחרון**
  app.use(errorHandler);

  return app;
}
