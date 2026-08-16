import { redis } from "@database/redis";
import { haversineDistanceKm } from "@modules/common/utils/math";
import { TRACKING_CONSTANTS } from "../constants/tracking.constants";

export interface StoredLocation {
  lat: number;
  lng: number;
  timestamp: number; // epoch ms
}

function locationKey(bookingId: string): string {
  return `tracking:location:${bookingId}`;
}

export const trackingLocationService = {
  async getLastLocation(bookingId: string): Promise<StoredLocation | null> {
    const raw = await redis.get(locationKey(bookingId));
    return raw ? (JSON.parse(raw) as StoredLocation) : null;
  },

  /**
   * שומר מיקום חדש ב-Redis בלבד (עם TTL) — לא ב-Database, בהתאם לעקרון
   * מזעור הנתונים שסוכם באפיון (NFR §1.1): לא נשמרת היסטוריית מיקום
   * מלאה לטווח ארוך, רק "המיקום האחרון הידוע".
   *
   * לפני השמירה, בודק סבירות מהירות מול המיקום הקודם — אם המרחק
   * שהוחזר תוך פרק הזמן שחלף מרמז על מהירות בלתי אפשרית, המיקום נדחה
   * (Location Spoofing) ולא נשמר ולא משודר הלאה.
   */
  async recordLocation(bookingId: string, next: { lat: number; lng: number }): Promise<boolean> {
    const previous = await this.getLastLocation(bookingId);
    const now = Date.now();

    if (previous) {
      const elapsedSeconds = (now - previous.timestamp) / 1000;

      if (elapsedSeconds >= TRACKING_CONSTANTS.MIN_INTERVAL_SECONDS_FOR_SPEED_CHECK) {
        const distanceKm = haversineDistanceKm(previous.lat, previous.lng, next.lat, next.lng);
        const impliedSpeedKmh = distanceKm / (elapsedSeconds / 3600);

        if (impliedSpeedKmh > TRACKING_CONSTANTS.MAX_PLAUSIBLE_SPEED_KMH) {
          return false; // חשד ל-Spoofing — לא נשמר ולא משודר
        }
      }
    }

    const toStore: StoredLocation = { lat: next.lat, lng: next.lng, timestamp: now };
    await redis.set(
      locationKey(bookingId),
      JSON.stringify(toStore),
      "EX",
      TRACKING_CONSTANTS.LOCATION_TTL_SECONDS
    );
    return true;
  },

  /** נקרא ע"י booking.service ברגע שההזמנה מגיעה לסטטוס סופי */
  async clearLocation(bookingId: string): Promise<void> {
    await redis.del(locationKey(bookingId));
  },
};
