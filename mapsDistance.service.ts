import { env } from "@config/env";
import { haversineDistanceKm, round2 } from "@modules/common/utils/math";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
}

// מקדם התאמה בין קו-אווירי למרחק כביש ריאלי (כבישים לא ישרים, עיקופים)
const MOCK_ROAD_DISTANCE_FACTOR = 1.3;
// מהירות עירונית ממוצעת משוערת (כולל רמזורים ועומס קל), לחישוב זמן נסיעה
const MOCK_AVERAGE_SPEED_KMH = 28;

export const mapsDistanceService = {
  /**
   * מחזיר מרחק וזמן נסיעה בין שתי נקודות.
   *
   * שלב זה ממומש כ-Mock (Haversine + מקדם כביש) כדי שמנוע התמחור יהיה
   * ניתן לבדיקה מלאה מקצה-לקצה בלי תלות ברשת/מפתח API אמיתי.
   * בפרודקשן — יש להחליף את הקריאה ל-fetchFromGoogleMapsApi (stub מתועד
   * למטה, עם env.GOOGLE_MAPS_API_KEY כבר מוכן לשימוש).
   */
  async getDistanceAndDuration(origin: GeoPoint, destination: GeoPoint): Promise<DistanceResult> {
    if (env.NODE_ENV === "production" && env.GOOGLE_MAPS_API_KEY) {
      return this.fetchFromGoogleMapsApi(origin, destination);
    }
    return this.mockEstimate(origin, destination);
  },

  mockEstimate(origin: GeoPoint, destination: GeoPoint): DistanceResult {
    const straightLineKm = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const distanceKm = round2(straightLineKm * MOCK_ROAD_DISTANCE_FACTOR);
    const durationMinutes = Math.ceil((distanceKm / MOCK_AVERAGE_SPEED_KMH) * 60);
    return { distanceKm, durationMinutes };
  },

  /**
   * TODO: מימוש אמיתי מול Google Maps Distance Matrix API.
   * נשאר כ-stub מתועד כדי שההחלפה תהיה נקודתית (קובץ אחד) וברורה,
   * מבלי לגעת בשאר מנוע התמחור.
   */
  async fetchFromGoogleMapsApi(_origin: GeoPoint, _destination: GeoPoint): Promise<DistanceResult> {
    throw new Error(
      "Google Maps integration not yet implemented — the mock estimator is used in development."
    );
  },
};
