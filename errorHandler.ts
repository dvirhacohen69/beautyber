import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "@modules/common/errors/AppError";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // שגיאת ולידציה של Zod
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.flatten(),
      },
    });
    return;
  }

  // שגיאה מוכרת/צפויה שהמודולים זרקו
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // שגיאה לא צפויה — נרשמת ללוג, לא נחשפת ללקוח
  req.log?.error({ err }, "Unhandled error");
  // eslint-disable-next-line no-console
  console.error(err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again later.",
    },
  });
}
