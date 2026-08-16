import rateLimit from "express-rate-limit";

/**
 * מגביל בקשות שליחת/אימות OTP לפי IP — שכבת הגנה נוספת מעל
 * מנגנון ה-Cooldown שכבר קיים ב-otp.service (שמבוסס על מספר טלפון).
 */
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 דקות
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts from this device. Please try again later.",
    },
  },
});
