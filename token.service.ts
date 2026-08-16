import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { UserRole } from "@prisma/client";
import { env } from "@config/env";
import { redis } from "@database/redis";
import { AppError } from "@modules/common/errors/AppError";

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  userId: string;
  jti: string; // מזהה ייחודי לטוקן — מאפשר revocation פרטני
}

const REFRESH_TOKEN_REDIS_PREFIX = "refresh_token:";

/** ממיר מחרוזת כמו "30d" למספר שניות, לשימוש כ-TTL ב-Redis */
function expiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 60 * 60 * 24 * 30; // ברירת מחדל: 30 יום
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

export const tokenService = {
  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    });
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    } catch {
      throw AppError.unauthorized("Invalid or expired access token");
    }
  },

  /**
   * מנפיק Refresh Token חדש ורושם את ה-jti שלו ב-Redis (Whitelist),
   * כדי שנוכל לבטל אותו באופן פרטני (logout) ולא רק לפי תפוגה.
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const jti = randomUUID();
    const token = jwt.sign({ userId, jti } as RefreshTokenPayload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    });

    const ttlSeconds = expiresInToSeconds(env.JWT_REFRESH_EXPIRES_IN);
    await redis.set(`${REFRESH_TOKEN_REDIS_PREFIX}${jti}`, userId, "EX", ttlSeconds);

    return token;
  },

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    } catch {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const isWhitelisted = await redis.get(`${REFRESH_TOKEN_REDIS_PREFIX}${payload.jti}`);
    if (!isWhitelisted) {
      throw AppError.unauthorized("Refresh token has been revoked");
    }

    return payload;
  },

  /** מבטל Refresh Token ספציפי (logout) */
  async revokeRefreshToken(jti: string): Promise<void> {
    await redis.del(`${REFRESH_TOKEN_REDIS_PREFIX}${jti}`);
  },

  /** מפענח jti בלי לאמת חתימה (שימושי ל-logout גם אם הטוקן כבר פג) */
  decodeRefreshTokenUnsafe(token: string): RefreshTokenPayload | null {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === "string") return null;
    return decoded as RefreshTokenPayload;
  },
};

// Token Rotation (ביטול ה-Refresh Token הישן + הנפקת זוג חדש) ממומש ב-
// auth.service.ts::refreshSession, כי הוא זקוק ל-role עדכני מה-DB לפני
// הנפקת ה-Access Token החדש — לא ניתן להשלים זאת בשירות הטוקנים לבדו.
