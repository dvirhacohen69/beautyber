import { NextFunction, Request, Response } from "express";
import { tokenService } from "../services/token.service";
import { AppError } from "@modules/common/errors/AppError";

/**
 * מאמת שקיים Access Token תקין ב-Authorization header ("Bearer <token>"),
 * ומצרף את פרטי המשתמש (userId, role) ל-req.user לשימוש בהמשך ה-pipeline.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw AppError.unauthorized("Missing or malformed Authorization header");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const payload = tokenService.verifyAccessToken(token);

  req.user = { userId: payload.userId, role: payload.role };
  next();
}
