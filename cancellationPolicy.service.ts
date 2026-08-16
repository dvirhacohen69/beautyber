import { Booking } from "@prisma/client";
import { round2 } from "@modules/common/utils/math";

export interface CancellationFeeResult {
  feePercentage: number;
  feeAmount: number;
  reason: string;
}

const FEE_TIERS = {
  FREE_CANCELLATION_HOURS: 4,
  PARTIAL_FEE_HOURS: 1,
  PARTIAL_FEE_PERCENTAGE: 0.25,
  FULL_FEE_PERCENTAGE: 1.0,
} as const;

function hoursUntil(booking: Booking): number {
  return (booking.scheduledStartTime.getTime() - Date.now()) / (1000 * 60 * 60);
}

export const cancellationPolicyService = {
  /**
   * מדיניות ביטול מדורגת ע"י הלקוח (לפי סעיף 3.2 באפיון):
   *   > 4 שעות מראש          -> 0%
   *   1-4 שעות מראש           -> 25%
   *   < שעה / הספק כבר בדרך   -> 100%
   */
  calculateClientFee(booking: Booking): CancellationFeeResult {
    const remainingHours = hoursUntil(booking);

    let feePercentage: number;
    let reason: string;

    if (booking.status === "provider_en_route") {
      feePercentage = FEE_TIERS.FULL_FEE_PERCENTAGE;
      reason = "Provider already en route";
    } else if (remainingHours > FEE_TIERS.FREE_CANCELLATION_HOURS) {
      feePercentage = 0;
      reason = "Cancelled more than 4 hours in advance";
    } else if (remainingHours > FEE_TIERS.PARTIAL_FEE_HOURS) {
      feePercentage = FEE_TIERS.PARTIAL_FEE_PERCENTAGE;
      reason = "Cancelled 1-4 hours before appointment";
    } else {
      feePercentage = FEE_TIERS.FULL_FEE_PERCENTAGE;
      reason = "Cancelled less than 1 hour before appointment";
    }

    return {
      feePercentage,
      feeAmount: round2(Number(booking.totalPrice) * feePercentage),
      reason,
    };
  },

  /**
   * קובע האם מגיעה סנקציה לספק על ביטול. הלקוח מקבל תמיד החזר מלא
   * כשהספק מבטל — זו רק הערכת הסנקציה כלפי הספק עצמו (לספירת cancellationCountMonth).
   */
  evaluateProviderCancellation(booking: Booking): { penalty: "none" | "trust_penalty" } {
    return {
      penalty: hoursUntil(booking) > FEE_TIERS.FREE_CANCELLATION_HOURS ? "none" : "trust_penalty",
    };
  },
};
