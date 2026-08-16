import { Request, Response } from "express";
import { authService } from "../services/auth.service";
import {
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  SendOtpDto,
  VerifyOtpDto,
} from "../dto/auth.dto";
import { AppError } from "@modules/common/errors/AppError";

export const authController = {
  async register(req: Request<unknown, unknown, RegisterDto>, res: Response) {
    const result = await authService.register(req.body);
    res.status(201).json({ data: result });
  },

  async sendLoginOtp(req: Request<unknown, unknown, SendOtpDto>, res: Response) {
    const result = await authService.requestLoginOtp(req.body.phoneNumber);
    res.status(200).json({ data: result });
  },

  async verifyOtp(req: Request<unknown, unknown, VerifyOtpDto>, res: Response) {
    const session = await authService.verifyOtpAndIssueSession(
      req.body.phoneNumber,
      req.body.otpCode
    );
    res.status(200).json({ data: session });
  },

  async refreshToken(req: Request<unknown, unknown, RefreshTokenDto>, res: Response) {
    const tokens = await authService.refreshSession(req.body.refreshToken);
    res.status(200).json({ data: tokens });
  },

  async logout(req: Request<unknown, unknown, LogoutDto>, res: Response) {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  },

  async me(req: Request, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    const user = await authService.getCurrentUser(req.user.userId);
    res.status(200).json({ data: user });
  },
};
