import { BookingStatus } from "@prisma/client";
import { AppError } from "@modules/common/errors/AppError";

/**
 * מפת מעברים חוקיים. כל מפתח = סטטוס נוכחי, הערך = רשימת הסטטוסים
 * המותרים לעבור אליהם ממנו. סטטוס עם מערך ריק הוא Terminal (סופי).
 *
 *   pending -> confirmed -> provider_en_route -> arrived -> in_progress -> completed
 *      \           \              \                 \
 *       -> cancelled_client/provider (בכל שלב עד תחילת הטיפול)
 *                                    \                 \
 *                                     -> no_show (אחרי en_route/arrived)
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled_client", "cancelled_provider"],
  confirmed: ["provider_en_route", "cancelled_client", "cancelled_provider"],
  provider_en_route: ["arrived", "cancelled_client", "cancelled_provider", "no_show"],
  arrived: ["in_progress", "no_show", "cancelled_client"],
  in_progress: ["completed"],
  completed: [],
  cancelled_client: [],
  cancelled_provider: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw AppError.conflict(`Cannot move booking from "${from}" to "${to}"`);
  }
}
