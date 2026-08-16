/** מעגל מספר לשתי ספרות עשרוניות (למחירים) */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** מעגל כלפי מעלה לכפולה הקרובה של step (למשל 69 -> 75 עם step=15) */
export function roundUpToNearest(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** מרחק קו-אווירי בין שתי נקודות גיאוגרפיות (נוסחת Haversine), בק"מ */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
