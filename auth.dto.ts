import { z } from "zod";

// טלפון בפורמט בינלאומי בסיסי (E.164-ish) — ניתן להחמיר לפי שוק היעד (למשל +972)
const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{9,15}$/, "Invalid phone number format");

export const registerSchema = z.object({
  phoneNumber: phoneNumberSchema,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["client", "provider"]), // admin לא נרשם דרך endpoint ציבורי
  email: z.string().email().optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const sendOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});
export type SendOtpDto = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otpCode: z.string().length(6, "OTP code must be 6 digits"),
});
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(10),
});
export type LogoutDto = z.infer<typeof logoutSchema>;
