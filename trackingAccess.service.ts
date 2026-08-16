import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { AuthenticatedUser } from "@modules/common/types/express";

/**
 * מוודא שהמשתמש המחובר הוא אכן צד להזמנה (לקוח/ספק שלה, או אדמין)
 * לפני חשיפת מיקום/ETA. מיושם באופן עצמאי (לא תלוי במודול Bookings)
 * כדי לשמור על גבול מודולרי נקי — שני המודולים פשוט משתמשים ב-Prisma
 * ישירות, בדומה לתבנית שכבר קיימת ב-availability.service.
 */
export async function assertCanAccessBookingTracking(actor: AuthenticatedUser, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking) {
    throw AppError.notFound("Booking not found");
  }

  if (actor.role === "admin") return booking;

  if (actor.role === "client") {
    if (booking.clientId !== actor.userId) {
      throw AppError.forbidden("This booking does not belong to you");
    }
    return booking;
  }

  if (actor.role === "provider") {
    const provider = await prisma.provider.findUnique({ where: { userId: actor.userId } });
    if (!provider || provider.providerId !== booking.providerId) {
      throw AppError.forbidden("This booking does not belong to you");
    }
    return booking;
  }

  throw AppError.forbidden();
}
