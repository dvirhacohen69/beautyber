import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";
import { otpRateLimiter } from "../middleware/otpRateLimiter";
import { validate } from "@modules/common/middleware/validate";
import { asyncHandler } from "@modules/common/utils/asyncHandler";
import {
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from "../dto/auth.dto";

const router = Router();

// ---- הרשמה ----
router.post(
  "/register",
  otpRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register)
);

// ---- OTP ----
router.post(
  "/otp/send",
  otpRateLimiter,
  validate({ body: sendOtpSchema }),
  asyncHandler(authController.sendLoginOtp)
);

router.post(
  "/otp/verify",
  otpRateLimiter,
  validate({ body: verifyOtpSchema }),
  asyncHandler(authController.verifyOtp)
);

// ---- Session Management ----
router.post(
  "/refresh-token",
  validate({ body: refreshTokenSchema }),
  asyncHandler(authController.refreshToken)
);

router.post(
  "/logout",
  validate({ body: logoutSchema }),
  asyncHandler(authController.logout)
);

// ---- Profile ----
router.get("/me", authenticate, asyncHandler(authController.me));

export { router as authRouter };
