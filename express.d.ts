import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// חשוב: קובץ טיפוסים גלובלי — הקובץ עצמו צריך להיות export {} ריק
// כדי ש-TypeScript יתייחס אליו כמודול ולא יתנגש עם declare global.
export {};
