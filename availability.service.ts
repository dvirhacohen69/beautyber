import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";

const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "provider_en_route",
  "arrived",
  "in_progress",
] as const;

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return combined;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const availabilityService = {
  /**
   * בדיקה מלאה לפני אישור/יצירת הזמנה: (1) אין חפיפה עם הזמנה קיימת
   * של הספק, (2) החלון נמצא בתוך שעות הפעילות שהספק הגדיר.
   *
   * חשוב: startTime/endTime המתקבלים כאן צריכים להגיע כבר מחושבים
   * ע"י pricing.service (כלומר estimatedEndTime שכולל טיפול+נסיעה+באפר) —
   * כך שבדיקת החפיפה "יורשת" אוטומטית את מקדם הביטחון של זמן הנסיעה.
   */
  async assertSlotIsAvailable(providerId: string, startTime: Date, endTime: Date): Promise<void> {
    const overlapping = await prisma.booking.findFirst({
      where: {
        providerId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        scheduledStartTime: { lt: endTime },
        estimatedEndTime: { gt: startTime },
      },
    });

    if (overlapping) {
      throw AppError.conflict("Provider already has a booking that overlaps this time slot");
    }

    await this.assertWithinWeeklyAvailability(providerId, startTime, endTime);
  },

  /**
   * בודק שהחלון המבוקש נמצא בתוך שעות הפעילות השבועיות של הספק, ושהיום
   * לא סומן כחסום (חופשה). אם הספק טרם הגדיר זמינות כלל (0 רשומות) —
   * לא חוסמים, כדי לא לנעול MVP/בדיקות לפני שהספק מילא יומן; ברגע
   * שיוגדרו שעות בפועל, האכיפה תהיה מלאה.
   */
  async assertWithinWeeklyAvailability(
    providerId: string,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    const weeklyRules = await prisma.providerAvailability.findMany({
      where: { providerId, isBlocked: false, dayOfWeek: { not: null } },
    });

    if (weeklyRules.length > 0) {
      const dayOfWeek = DAY_NAMES[startTime.getDay()];
      const matchingRules = weeklyRules.filter((rule) => rule.dayOfWeek === dayOfWeek);

      if (matchingRules.length === 0) {
        throw AppError.conflict("Provider is not available on the selected day");
      }

      const fitsInSomeRule = matchingRules.some((rule) => {
        if (!rule.startTime || !rule.endTime) return false;
        const ruleStart = combineDateAndTime(startTime, rule.startTime);
        const ruleEnd = combineDateAndTime(startTime, rule.endTime);
        return startTime >= ruleStart && endTime <= ruleEnd;
      });

      if (!fitsInSomeRule) {
        throw AppError.conflict("Selected time is outside the provider's working hours");
      }
    }

    const blockedDay = await prisma.providerAvailability.findFirst({
      where: { providerId, isBlocked: true, blockedDate: startOfDay(startTime) },
    });

    if (blockedDay) {
      throw AppError.conflict("Provider has blocked this date");
    }
  },
};
