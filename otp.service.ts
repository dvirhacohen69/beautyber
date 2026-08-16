import { redis } from "@database/redis";
import { env } from "@config/env";
import { AppError } from "@modules/common/errors/AppError";

const OTP_KEY_PREFIX = "otp:";
const OTP_RESEND_COOLDOWN_KEY_PREFIX = "otp:cooldown:";
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPTS_KEY_PREFIX = "otp:attempts:";

function generateOtpCode(length: number): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  const code = Math.floor(min + Math.random() * (max - min + 1));
  return code.toString();
}

export const otpService = {
  /**
   * מייצר קוד OTP, שומר אותו ב-Redis עם TTL, ו"שולח" אותו (Mock בשלב זה).
   * בסביבת production יש להחליף את שלב השליחה באינטגרציה אמיתית
   * (Twilio / ספק SMS מקומי) — הממשק כאן כבר מוכן לכך.
   */
  async generateAndSend(phoneNumber: string): Promise<void> {
    const cooldownKey = `${OTP_RESEND_COOLDOWN_KEY_PREFIX}${phoneNumber}`;
    const isInCooldown = await redis.get(cooldownKey);
    if (isInCooldown) {
      throw AppError.tooManyRequests(
        "Please wait before requesting another code"
      );
    }

    const code = generateOtpCode(env.OTP_LENGTH);
    const otpKey = `${OTP_KEY_PREFIX}${phoneNumber}`;
    const attemptsKey = `${OTP_ATTEMPTS_KEY_PREFIX}${phoneNumber}`;

    await redis.set(otpKey, code, "EX", env.OTP_EXPIRES_IN_SECONDS);
    await redis.del(attemptsKey); // איפוס מונה ניסיונות עם כל קוד חדש
    await redis.set(cooldownKey, "1", "EX", OTP_RESEND_COOLDOWN_SECONDS);

    await this.mockSendSms(phoneNumber, code);
  },

  /**
   * MOCK: בשלב זה רק מדפיס ללוג. יש להחליף באינטגרציית SMS אמיתית.
   */
  async mockSendSms(phoneNumber: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`📱 [MOCK SMS] OTP for ${phoneNumber}: ${code}`);
  },

  /**
   * מאמת קוד OTP מול מה שנשמר ב-Redis. מגביל מספר ניסיונות שגויים
   * כדי למנוע Brute-Force על קוד בן 6 ספרות.
   */
  async verify(phoneNumber: string, submittedCode: string): Promise<boolean> {
    const otpKey = `${OTP_KEY_PREFIX}${phoneNumber}`;
    const attemptsKey = `${OTP_ATTEMPTS_KEY_PREFIX}${phoneNumber}`;

    const attempts = Number((await redis.get(attemptsKey)) ?? 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw AppError.tooManyRequests(
        "Too many failed attempts. Please request a new code."
      );
    }

    const storedCode = await redis.get(otpKey);
    if (!storedCode) {
      throw AppError.badRequest("Code expired or not found. Please request a new one.");
    }

    if (storedCode !== submittedCode) {
      await redis.incr(attemptsKey);
      await redis.expire(attemptsKey, env.OTP_EXPIRES_IN_SECONDS);
      return false;
    }

    // קוד תקין — ניקוי כדי למנוע שימוש חוזר
    await redis.del(otpKey);
    await redis.del(attemptsKey);
    return true;
  },
};
