import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { AuthenticatedUser } from "@modules/common/types/express";
import { mockPaymentGateway } from "@modules/payments/services/mockPaymentGateway.service";
import { closeTrackingRoom } from "@modules/tracking/gateway/tracking.gateway";
import { trackingLocationService } from "@modules/tracking/services/trackingLocation.service";
import { pricingService } from "./pricing.service";
import { availabilityService } from "./availability.service";
import { cancellationPolicyService } from "./cancellationPolicy.service";
import { assertTransition } from "../state-machine/booking-state-machine";
import { CreateBookingDto, QuoteRequestDto, UpdateBookingStatusDto } from "../dto/booking.dto";

/** סוגר את ערוץ המעקב החי ומנקה את המיקום השמור ב-Redis (Data Minimization) */
async function endTracking(bookingId: string): Promise<void> {
  closeTrackingRoom(bookingId);
  await trackingLocationService.clearLocation(bookingId);
}

export const bookingService = {
  /** POST /bookings/quote — חישוב מחיר ללא יצירת הזמנה בפועל */
  async createQuote(clientId: string, dto: QuoteRequestDto) {
    const scheduledStartTime = new Date(dto.scheduledStartTime ?? Date.now());
    return pricingService.calculateQuote({
      providerServiceId: dto.providerServiceId,
      addressId: dto.addressId,
      clientId,
      scheduledStartTime,
    });
  },

  /**
   * יוצר הזמנה: מחשב מחדש את המחיר בצד השרת (לא סומכים על מה שהלקוח
   * שלח), בודק חפיפה ביומן הספק, יוצר את הרשומה + לוג הסטטוס הראשוני
   * בתוך טרנזקציה אחת, ורק אז תופס Pre-Authorization על אמצעי התשלום.
   */
  async createBooking(clientId: string, dto: CreateBookingDto) {
    const scheduledStartTime = new Date(dto.scheduledStartTime);
    if (scheduledStartTime.getTime() <= Date.now()) {
      throw AppError.badRequest("Scheduled time must be in the future");
    }

    const quote = await pricingService.calculateQuote({
      providerServiceId: dto.providerServiceId,
      addressId: dto.addressId,
      clientId,
      scheduledStartTime,
    });

    await availabilityService.assertSlotIsAvailable(
      quote.providerId,
      scheduledStartTime,
      quote.estimatedEndTime
    );

    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          clientId,
          providerId: quote.providerId,
          providerServiceId: dto.providerServiceId,
          addressId: dto.addressId,
          scheduledStartTime,
          estimatedEndTime: quote.estimatedEndTime,
          status: "pending",
          basePrice: quote.basePrice,
          distanceFee: quote.distanceFee,
          surgeMultiplier: quote.surgeMultiplier,
          totalPrice: quote.totalPrice,
        },
      });

      await tx.bookingStatusLog.create({
        data: { bookingId: created.bookingId, status: "pending", changedByUserId: clientId },
      });

      return created;
    });

    // Pre-Auth מבוצע מחוץ לטרנזקציה של ה-DB (קריאה ל"שער תשלומים" חיצוני
    // מדומה); אם היא נכשלת, מבטלים את ההזמנה שזה עתה נוצרה.
    try {
      await mockPaymentGateway.preAuthorize({
        bookingId: booking.bookingId,
        clientId,
        totalPrice: Number(booking.totalPrice),
        paymentMethodId: dto.paymentMethodId,
      });
    } catch (err) {
      await prisma.booking.delete({ where: { bookingId: booking.bookingId } });
      throw err;
    }

    return booking;
  },

  /** הספק מאשר הזמנה שממתינה */
  async confirmBooking(providerUserId: string, bookingId: string) {
    const { booking } = await this.getBookingForProviderAction(providerUserId, bookingId);
    assertTransition(booking.status, "confirmed");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { bookingId },
        data: { status: "confirmed" },
      });
      await tx.bookingStatusLog.create({
        data: { bookingId, status: "confirmed", changedByUserId: providerUserId },
      });
      return updated;
    });
  },

  /** הספק דוחה הזמנה שממתינה — הלקוח מקבל שחרור מלא (ללא אשמתו) */
  async rejectBooking(providerUserId: string, bookingId: string, reason?: string) {
    const { booking } = await this.getBookingForProviderAction(providerUserId, bookingId);
    assertTransition(booking.status, "cancelled_provider");

    await mockPaymentGateway.release(bookingId);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { bookingId },
        data: {
          status: "cancelled_provider",
          cancelledBy: "provider",
          cancellationReason: reason ?? "Rejected by provider",
        },
      });
      await tx.bookingStatusLog.create({
        data: { bookingId, status: "cancelled_provider", changedByUserId: providerUserId },
      });
      return updated;
    }).then(async (updated) => {
      await endTracking(bookingId);
      return updated;
    });
  },

  /**
   * הספק מקדם את ההזמנה דרך שלבי הביצוע: en_route -> arrived -> in_progress
   * -> completed. בסיום ("completed") מתבצעת סליקה סופית (Capture) אוטומטית.
   */
  async updateStatus(providerUserId: string, bookingId: string, dto: UpdateBookingStatusDto) {
    const { booking } = await this.getBookingForProviderAction(providerUserId, bookingId);
    assertTransition(booking.status, dto.status);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { bookingId },
        data: { status: dto.status },
      });
      await tx.bookingStatusLog.create({
        data: {
          bookingId,
          status: dto.status,
          changedByUserId: providerUserId,
          lat: dto.lat,
          lng: dto.lng,
        },
      });
      return result;
    });

    if (dto.status === "completed") {
      await mockPaymentGateway.capture({ bookingId, amount: Number(updated.totalPrice) });
      await endTracking(bookingId);
    }

    return updated;
  },

  /**
   * ביטול הזמנה ע"י לקוח או ספק. מחשב דמי ביטול (ללקוח) או סנקציה
   * (לספק) לפי מדיניות הביטולים המדורגת, ומבצע Capture/Release בהתאם.
   */
  async cancelBooking(actor: AuthenticatedUser, bookingId: string, reason?: string) {
    const booking = await this.getBookingOrThrow(bookingId);
    await this.assertBookingOwnership(actor, booking);

    const targetStatus = actor.role === "provider" ? "cancelled_provider" : "cancelled_client";
    assertTransition(booking.status, targetStatus);

    let finalReason = reason;

    if (actor.role === "client") {
      const { feeAmount, feePercentage, reason: policyReason } =
        cancellationPolicyService.calculateClientFee(booking);

      if (feeAmount > 0) {
        await mockPaymentGateway.capture({ bookingId, amount: feeAmount });
      } else {
        await mockPaymentGateway.release(bookingId);
      }
      finalReason = reason ?? `${policyReason} (fee: ${Math.round(feePercentage * 100)}%)`;
    } else {
      // ספק מבטל — הלקוח תמיד מקבל החזר מלא; בודקים רק סנקציה כלפי הספק
      await mockPaymentGateway.release(bookingId);
      const evaluation = cancellationPolicyService.evaluateProviderCancellation(booking);
      if (evaluation.penalty === "trust_penalty") {
        await prisma.provider.update({
          where: { providerId: booking.providerId },
          data: { cancellationCountMonth: { increment: 1 } },
        });
      }
      finalReason = reason ?? "Cancelled by provider";
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { bookingId },
        data: { status: targetStatus, cancelledBy: actor.role, cancellationReason: finalReason },
      });
      await tx.bookingStatusLog.create({
        data: { bookingId, status: targetStatus, changedByUserId: actor.userId },
      });
      return updated;
    }).then(async (updated) => {
      await endTracking(bookingId);
      return updated;
    });
  },

  /**
   * דיווח על אי-הגעה. מטעם הלקוח = הספק לא הגיע (החזר מלא + סנקציה
   * לספק). מטעם הספק = הלקוח לא הגיע (חיוב מלא + ירידת trust_score).
   */
  async reportNoShow(actor: AuthenticatedUser, bookingId: string, reason?: string) {
    const booking = await this.getBookingOrThrow(bookingId);
    await this.assertBookingOwnership(actor, booking);
    assertTransition(booking.status, "no_show");

    if (actor.role === "client") {
      await mockPaymentGateway.release(bookingId);
      await prisma.provider.update({
        where: { providerId: booking.providerId },
        data: { cancellationCountMonth: { increment: 1 } },
      });
    } else {
      await mockPaymentGateway.capture({ bookingId, amount: Number(booking.totalPrice) });
      await prisma.user.update({
        where: { userId: booking.clientId },
        data: { trustScore: { decrement: 0.5 } },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { bookingId },
        data: { status: "no_show", cancellationReason: reason ?? "No-show reported" },
      });
      await tx.bookingStatusLog.create({
        data: { bookingId, status: "no_show", changedByUserId: actor.userId },
      });
      return result;
    });

    await endTracking(bookingId);
    return updated;
  },

  /** GET /bookings/me — רשימת הזמנות לפי role (לקוח/ספק) */
  async listForUser(actor: AuthenticatedUser) {
    if (actor.role === "client") {
      return prisma.booking.findMany({
        where: { clientId: actor.userId },
        orderBy: { scheduledStartTime: "desc" },
        include: {
          provider: { select: { businessName: true, averageRating: true } },
          providerService: { include: { category: true } },
        },
      });
    }

    if (actor.role === "provider") {
      const provider = await prisma.provider.findUnique({ where: { userId: actor.userId } });
      if (!provider) throw AppError.notFound("Provider profile not found");

      return prisma.booking.findMany({
        where: { providerId: provider.providerId },
        orderBy: { scheduledStartTime: "desc" },
        include: {
          client: { select: { fullName: true, phoneNumber: true } },
          providerService: { include: { category: true } },
        },
      });
    }

    // admin — יטופל במלואו במודול Admin (חלק עתידי); כרגע מחזיר הכל
    return prisma.booking.findMany({ orderBy: { scheduledStartTime: "desc" } });
  },

  /**
   * GET /bookings/:bookingId — מחזיר פרטי הזמנה עשירים (לא רק שורת ה-DB
   * הגולמית): פרטי קשר של הצד השני (לקוח/ספק), כתובת היעד, ושם השירות.
   * נחשף רק לאחר אימות בעלות (assertBookingOwnership) — לכן מספר טלפון
   * כאן בטוח בהרבה מחשיפתו בפרופיל ציבורי: שני הצדדים כבר "משויכים"
   * להזמנה ספציפית ומאומתת, לא כל גולש אנונימי.
   */
  async getById(actor: AuthenticatedUser, bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: {
        client: { select: { fullName: true, phoneNumber: true } },
        provider: {
          select: {
            businessName: true,
            averageRating: true,
            user: { select: { phoneNumber: true } },
          },
        },
        providerService: { include: { category: true } },
        address: true,
        review: { select: { reviewId: true } },
      },
    });

    if (!booking) {
      throw AppError.notFound("Booking not found");
    }

    await this.assertBookingOwnership(actor, booking);

    return {
      bookingId: booking.bookingId,
      clientId: booking.clientId,
      providerId: booking.providerId,
      addressId: booking.addressId,
      status: booking.status,
      scheduledStartTime: booking.scheduledStartTime,
      estimatedEndTime: booking.estimatedEndTime,
      basePrice: booking.basePrice,
      distanceFee: booking.distanceFee,
      surgeMultiplier: booking.surgeMultiplier,
      totalPrice: booking.totalPrice,
      cancellationReason: booking.cancellationReason,
      hasReview: Boolean(booking.review),
      client: {
        fullName: booking.client.fullName,
        phoneNumber: booking.client.phoneNumber,
      },
      provider: {
        businessName: booking.provider.businessName,
        averageRating: booking.provider.averageRating,
        phoneNumber: booking.provider.user.phoneNumber,
      },
      service: {
        categoryName: booking.providerService.category.name,
        durationMinutes: booking.providerService.durationMinutes,
      },
      address: {
        label: booking.address.label,
        fullAddressText: booking.address.fullAddressText,
        lat: booking.address.lat,
        lng: booking.address.lng,
      },
    };
  },

  // ---------------------------------------------------------------------
  // Helpers פנימיים
  // ---------------------------------------------------------------------

  async getBookingOrThrow(bookingId: string) {
    const booking = await prisma.booking.findUnique({ where: { bookingId } });
    if (!booking) throw AppError.notFound("Booking not found");
    return booking;
  },

  /** מוודא שהספק המחובר הוא בעל ההזמנה, ומחזיר גם את פרופיל הספק */
  async getBookingForProviderAction(providerUserId: string, bookingId: string) {
    const provider = await prisma.provider.findUnique({ where: { userId: providerUserId } });
    if (!provider) throw AppError.notFound("Provider profile not found");

    const booking = await this.getBookingOrThrow(bookingId);
    if (booking.providerId !== provider.providerId) {
      throw AppError.forbidden("This booking does not belong to you");
    }

    return { booking, provider };
  },

  /** מוודא בעלות על הזמנה עבור לקוח/ספק/אדמין */
  async assertBookingOwnership(
    actor: AuthenticatedUser,
    booking: { clientId: string; providerId: string }
  ): Promise<void> {
    if (actor.role === "admin") return;

    if (actor.role === "client") {
      if (booking.clientId !== actor.userId) {
        throw AppError.forbidden("This booking does not belong to you");
      }
      return;
    }

    if (actor.role === "provider") {
      const provider = await prisma.provider.findUnique({ where: { userId: actor.userId } });
      if (!provider || provider.providerId !== booking.providerId) {
        throw AppError.forbidden("This booking does not belong to you");
      }
      return;
    }

    throw AppError.forbidden();
  },
};
