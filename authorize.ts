import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "@modules/common/errors/AppError";

/**
 * מגביל גישה ל-roles מסוימים בלבד. יש להשתמש **אחרי** authenticate,
 * כי הוא תלוי ב-req.user שמוזרק שם.
 *
 * שימוש: router.get("/admin/x", authenticate, authorize("admin"), handler)
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw AppError.forbidden(
        `This action requires one of the following roles: ${allowedRoles.join(", ")}`
      );
    }
    next();
  };
}
