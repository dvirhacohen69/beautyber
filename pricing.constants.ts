/**
 * קבועי מנוע התמחור. אלו תעריפי פתיחה להמחשה (כפי שסוכם באפיון) —
 * בעתיד כדאי להעביר אותם לטבלת קונפיגורציה בניהול אדמין במקום קבועים
 * קשיחים בקוד, כדי לאפשר עדכון תעריפים ללא Deploy.
 */
export const PRICING_CONSTANTS = {
  // ---- Distance Fee ----
  PICKUP_BASE_FEE: 15, // ₪, עלות מינימלית קבועה גם לנסיעות קצרות
  RATE_PER_KM: 2.5, // ₪ לכל ק"מ
  RATE_PER_MINUTE: 0.5, // ₪ לכל דקת נסיעה

  // ---- Slot Blocking ----
  TRAFFIC_BUFFER_PERCENT: 0.2, // 20% תוספת ביטחון על זמן הנסיעה המחושב
  SLOT_ROUNDING_MINUTES: 15, // עיגול זמן חסימה כלפי מעלה לרבע שעה קרוב

  // ---- Time-based Surcharge ----
  EVENING_HOUR_START: 19, // משעה 19:00
  EVENING_HOUR_END: 6, // עד 06:00
  EVENING_SURCHARGE: 0.15, // +15%
  WEEKEND_SURCHARGE: 0.2, // +20% (שישי-שבת)

  // ---- Demand-based Surge ----
  DEMAND_SURGE_SENSITIVITY: 0.3, // רגישות העלייה למכפיל לפי יחס ביקוש/היצע
  MAX_SURGE_MULTIPLIER: 2.0, // תקרת מכפיל כוללת (זמן + ביקוש משולבים)

  // ---- Tax ----
  VAT_RATE: 0.18, // מע"מ - יש לעדכן לפי שיעור עדכני ושוק היעד
} as const;
