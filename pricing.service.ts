import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { round2, roundUpToNearest } from "@modules/common/utils/math";
import { mapsDistanceService } from "./mapsDistance.service";
import { PRICING_CONSTANTS } from "../constants/pricing.constants";

export interface QuoteInput {
  providerServiceId: string;
  addressId: string;
  clientId: string;
  scheduledStartTime: Date;
}

export interface QuoteResult {
  providerId: string;
  providerServiceId: string;
  categoryName: string;
  basePrice: number;
  distanceKm: number;
  travelDurationMinutes: number;
  distanceFee: number;
  surgeMultiplier: number;
  vatAmount: number;
  totalPrice: number;
  serviceDurationMinutes: number;
  estimatedTotalDurationMinutes: number;
  scheduledStartTime: Date;
  estimatedEndTime: Date;
}

/** תוספת שעות ערב/סופ"ש (סעיף 2.1 באפיון: Surge/Premium לפי שעה) */
function getTimeMultiplier(date: Date): number {
  const day = date.getDay(); // 0=Sun ... 5=Fri, 6=Sat
  const hour = date.getHours();
  const isWeekend = day === 5 || day === 6; // שישי-שבת

  if (isWeekend) return 1 + PRICING_CONSTANTS.WEEKEND_SURCHARGE;
  if (hour >= PRICING_CONSTANTS.EVENING_HOUR_START || hour < PRICING_CONSTANTS.EVENING_HOUR_END) {
    return 1 + PRICING_CONSTANTS.EVENING_SURCHARGE;
  }
  return 1;
}

/**
 * מכפיל ביקוש דינמי (Surge), בקירוב ברמת המערכת כולה (לא גיאוגרפי).
 * שדרוג עתידי טבעי: שאילתת רדיוס גיאוגרפי (PostGIS) סביב מיקום הספק,
 * במקום יחס עירוני/ארצי כולל.
 */
async function getDemandMultiplier(): Promise<number> {
  const [activeBookings, onlineProviders] = await Promise.all([
    prisma.booking.count({
      where: { status: { in: ["pending", "confirmed", "provider_en_route"] } },
    }),
    prisma.provider.count({ where: { isOnline: true, kycStatus: "approved" } }),
  ]);

  if (onlineProviders === 0) return PRICING_CONSTANTS.MAX_SURGE_MULTIPLIER;

  const demandRatio = activeBookings / onlineProviders;
  const multiplier = 1 + Math.max(demandRatio - 1, 0) * PRICING_CONSTANTS.DEMAND_SURGE_SENSITIVITY;
  return round2(multiplier);
}

export const pricingService = {
  /**
   * מחשב הצעת מחיר מלאה. תמיד מחושב מחדש בצד השרת (אף פעם לא סומכים
   * על מחיר שמגיע מהלקוח) — נקרא הן מ-POST /bookings/quote והן פנימית
   * מ-booking.service בעת יצירת הזמנה בפועל.
   */
  async calculateQuote(input: QuoteInput): Promise<QuoteResult> {
    const providerService = await prisma.providerService.findUnique({
      where: { providerServiceId: input.providerServiceId },
      include: { provider: true, category: true },
    });

    if (!providerService || !providerService.isActive) {
      throw AppError.notFound("Service not found or no longer offered");
    }

    const provider = providerService.provider;
    if (provider.kycStatus !== "approved") {
      throw AppError.badRequest("Provider is not yet approved");
    }
    if (!provider.isOnline) {
      throw AppError.badRequest("Provider is currently offline");
    }

    const address = await prisma.savedAddress.findUnique({
      where: { addressId: input.addressId },
    });
    if (!address || address.userId !== input.clientId) {
      throw AppError.notFound("Address not found");
    }

    const distanceResult = await mapsDistanceService.getDistanceAndDuration(
      { lat: Number(provider.baseLocationLat), lng: Number(provider.baseLocationLng) },
      { lat: Number(address.lat), lng: Number(address.lng) }
    );

    if (distanceResult.distanceKm > Number(provider.serviceRadiusKm)) {
      throw AppError.badRequest("This address is outside the provider's service area");
    }

    // ---- Distance Fee = Pickup Base Fee + (Km × Rate) + (Min × Rate) ----
    const distanceFeeBase =
      PRICING_CONSTANTS.PICKUP_BASE_FEE +
      distanceResult.distanceKm * PRICING_CONSTANTS.RATE_PER_KM +
      distanceResult.durationMinutes * PRICING_CONSTANTS.RATE_PER_MINUTE;

    // ---- Surge Multiplier = זמן (ערב/סופ"ש) × ביקוש, מוגבל לתקרה ----
    const timeMultiplier = getTimeMultiplier(input.scheduledStartTime);
    const demandMultiplier = await getDemandMultiplier();
    const surgeMultiplier = Math.min(
      round2(timeMultiplier * demandMultiplier),
      PRICING_CONSTANTS.MAX_SURGE_MULTIPLIER
    );

    // Surge חל על רכיב הנסיעה בלבד, לא על מחיר הבסיס של השירות עצמו
    const distanceFee = round2(distanceFeeBase * surgeMultiplier);
    const basePrice = Number(providerService.customPrice);
    const subtotal = basePrice + distanceFee;
    const vatAmount = round2(subtotal * PRICING_CONSTANTS.VAT_RATE);
    const totalPrice = round2(subtotal + vatAmount);

    // ---- חסימת זמן ביומן: טיפול + נסיעה + מקדם ביטחון, מעוגל לרבע שעה ----
    const travelBufferMinutes = Math.ceil(
      distanceResult.durationMinutes * PRICING_CONSTANTS.TRAFFIC_BUFFER_PERCENT
    );
    const rawDurationMinutes =
      providerService.durationMinutes + distanceResult.durationMinutes + travelBufferMinutes;
    const estimatedTotalDurationMinutes = roundUpToNearest(
      rawDurationMinutes,
      PRICING_CONSTANTS.SLOT_ROUNDING_MINUTES
    );

    const estimatedEndTime = new Date(
      input.scheduledStartTime.getTime() + estimatedTotalDurationMinutes * 60_000
    );

    return {
      providerId: provider.providerId,
      providerServiceId: providerService.providerServiceId,
      categoryName: providerService.category.name,
      basePrice,
      distanceKm: distanceResult.distanceKm,
      travelDurationMinutes: distanceResult.durationMinutes,
      distanceFee,
      surgeMultiplier,
      vatAmount,
      totalPrice,
      serviceDurationMinutes: providerService.durationMinutes,
      estimatedTotalDurationMinutes,
      scheduledStartTime: input.scheduledStartTime,
      estimatedEndTime,
    };
  },
};
