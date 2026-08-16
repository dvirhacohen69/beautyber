/**
 * מחלקת שגיאה אחידה — כל שגיאה "צפויה" (ולידציה, הרשאות, לא נמצא וכו')
 * צריכה לזרוק AppError כדי שה-errorHandler הגלובלי יידע להחזיר JSON עקבי.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Forbidden") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string) {
    return new AppError(409, "CONFLICT", message);
  }

  static tooManyRequests(message = "Too many requests") {
    return new AppError(429, "TOO_MANY_REQUESTS", message);
  }

  static internal(message = "Internal server error") {
    return new AppError(500, "INTERNAL_ERROR", message);
  }
}
