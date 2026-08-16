import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { otpService } from "./otp.service";
import { tokenService } from "./token.service";
import { RegisterDto } from "../dto/auth.dto";

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    userId: string;
    role: string;
    fullName: string;
    phoneNumber: string;
    status: string;
  };
}

export const authService = {
  /**
   * יוצר משתמש חדש (client/provider) בסטטוס 'pending' — הופך ל-'active'
   * רק לאחר אימות OTP מוצלח. אם המשתמש כבר קיים עם אותו טלפון, מחזיר שגיאה
   * ברורה (למעט אם עדיין pending — אז מאפשר להמשיך את תהליך ההרשמה).
   */
  async register(dto: RegisterDto) {
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existingUser && existingUser.status !== "pending") {
      throw AppError.conflict("An account with this phone number already exists");
    }

    const user =
      existingUser ??
      (await prisma.user.create({
        data: {
          phoneNumber: dto.phoneNumber,
          fullName: dto.fullName,
          role: dto.role,
          email: dto.email,
          status: "pending",
        },
      }));

    await otpService.generateAndSend(dto.phoneNumber);

    return {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      message: "Verification code sent",
    };
  },

  /**
   * שולח OTP למשתמש קיים לצורך התחברות (Login).
   */
  async requestLoginOtp(phoneNumber: string) {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      throw AppError.notFound("No account found with this phone number");
    }
    if (user.status === "blocked" || user.status === "suspended") {
      throw AppError.forbidden("This account is not active. Please contact support.");
    }

    await otpService.generateAndSend(phoneNumber);
    return { message: "Verification code sent" };
  },

  /**
   * מאמת OTP ומנפיק סשן (Access + Refresh Token). אם זו ההרשמה הראשונה
   * (status='pending'), המשתמש מופעל (status='active').
   */
  async verifyOtpAndIssueSession(phoneNumber: string, otpCode: string): Promise<AuthSession> {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      throw AppError.notFound("No account found with this phone number");
    }

    const isValid = await otpService.verify(phoneNumber, otpCode);
    if (!isValid) {
      throw AppError.badRequest("Invalid verification code");
    }

    const activatedUser =
      user.status === "pending"
        ? await prisma.user.update({
            where: { userId: user.userId },
            data: { status: "active", lastLoginAt: new Date() },
          })
        : await prisma.user.update({
            where: { userId: user.userId },
            data: { lastLoginAt: new Date() },
          });

    const accessToken = tokenService.generateAccessToken({
      userId: activatedUser.userId,
      role: activatedUser.role,
    });
    const refreshToken = await tokenService.generateRefreshToken(activatedUser.userId);

    return {
      accessToken,
      refreshToken,
      user: {
        userId: activatedUser.userId,
        role: activatedUser.role,
        fullName: activatedUser.fullName,
        phoneNumber: activatedUser.phoneNumber,
        status: activatedUser.status,
      },
    };
  },

  /**
   * מרענן זוג טוקנים (Token Rotation). ה-role נשלף מחדש מה-DB בכל רענון
   * (ולא רק מהטוקן הישן) כדי לשקף מיידית שינויי הרשאה/חסימה.
   */
  async refreshSession(oldRefreshToken: string) {
    const payload = await tokenService.verifyRefreshToken(oldRefreshToken);

    const user = await prisma.user.findUnique({ where: { userId: payload.userId } });
    if (!user || user.status === "blocked" || user.status === "suspended") {
      await tokenService.revokeRefreshToken(payload.jti);
      throw AppError.unauthorized("Account is not active");
    }

    await tokenService.revokeRefreshToken(payload.jti);
    const newAccessToken = tokenService.generateAccessToken({
      userId: user.userId,
      role: user.role,
    });
    const newRefreshToken = await tokenService.generateRefreshToken(user.userId);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken: string): Promise<void> {
    const decoded = tokenService.decodeRefreshTokenUnsafe(refreshToken);
    if (decoded?.jti) {
      await tokenService.revokeRefreshToken(decoded.jti);
    }
  },

  /**
   * מחזיר את פרטי המשתמש המחובר, כולל פרופיל ספק אם role='provider'.
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        role: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        profileImageUrl: true,
        status: true,
        trustScore: true,
        createdAt: true,
        providerProfile: {
          select: {
            providerId: true,
            businessName: true,
            kycStatus: true,
            isOnline: true,
            averageRating: true,
            totalReviews: true,
          },
        },
      },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  },
};
