import { BookingStatus } from "@prisma/client";

export const TRACKING_CONSTANTS = {
  // מיקום נשמר ב-Redis בלבד (לא ב-DB) ונמחק תוך זמן קצר אחרי סיום ההזמנה
  LOCATION_TTL_SECONDS: 60 * 60 * 6, // 6 שעות - מספיק לכיסוי הזמנה ארוכה + ביטחון
  MAX_PLAUSIBLE_SPEED_KMH: 140, // כביש מהיר + מרווח ל-GPS jitter, מעליו חשד ל-Spoofing
  MIN_INTERVAL_SECONDS_FOR_SPEED_CHECK: 2, // מרווחים קצרים מדי לא נבדקים (רעש GPS טבעי)
} as const;

/** סטטוסים בהם מותר להצטרף לערוץ המעקב (WebSocket room) */
export const TRACKABLE_JOIN_STATUSES: BookingStatus[] = [
  "confirmed",
  "provider_en_route",
  "arrived",
  "in_progress",
];

/** סטטוסים בהם מתקבל בפועל שידור מיקום מהספק */
export const LOCATION_UPDATE_STATUSES: BookingStatus[] = [
  "provider_en_route",
  "arrived",
  "in_progress",
];
