import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { mockPaymentGateway } from "@modules/payments/services/mockPaymentGateway.service";
import { CreateReviewDto } from "../dto/review.dto";

export const reviewService = {
  /**
   * יוצר ביקורת עבור הזמנה שהושלמה, ומעדכן את averageRating/totalReviews
   * של הספק (מחושב מחדש מכל הביקורות - פשוט וברור בהיקף הנוכחי; שדרוג
   * עתידי סביר הוא ממוצע מצטבר אם נפח הביקורות יגדל משמעותית). אם
   * התקבל גם tipAmount, מוסיף אותו לתשלום שכבר נסלק (Capture) בסיום
   * השירות - הטיפ תמיד מוחלט במלואו לספק, ללא עמלת פלטפורמה.
   */
  async create(clientId: string, bookingId: string, dto: CreateReviewDto) {
    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) {
      throw AppError.notFound("Booking not found");
    }
    if (booking.clientId !== clientId) {
      throw AppError.forbidden("This booking does not belong to you");
    }
    if (booking.status !== "completed") {
      throw AppError.badRequest("Can only review a completed booking");
    }

    const existingReview = await prisma.review.findUnique({ where: { bookingId } });
    if (existingReview) {
      throw AppError.conflict("This booking has already been reviewed");
    }

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId,
          clientId,
          providerId: booking.providerId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });

      const aggregate = await tx.review.aggregate({
        where: { providerId: booking.providerId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.provider.update({
        where: { providerId: booking.providerId },
        data: {
          averageRating: round2(aggregate._avg.rating ?? dto.rating),
          totalReviews: aggregate._count.rating,
        },
      });

      return created;
    });

    if (dto.tipAmount && dto.tipAmount > 0) {
      await mockPaymentGateway.addTip(bookingId, dto.tipAmount);
    }

    return review;
  },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
