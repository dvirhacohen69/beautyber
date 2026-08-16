import { prisma } from "@database/prisma";
import { AppError } from "@modules/common/errors/AppError";
import { mapsDistanceService } from "@modules/bookings/services/mapsDistance.service";
import { trackingLocationService } from "./trackingLocation.service";

export interface EtaResult {
  distanceKm: number;
  etaMinutes: number;
  lastLocationTimestamp: number;
}

export const etaService = {
  /** מחזיר null אם אין עדיין מיקום ידוע (הספק טרם התחיל לשדר) */
  async calculateEta(bookingId: string): Promise<EtaResult | null> {
    const lastLocation = await trackingLocationService.getLastLocation(bookingId);
    if (!lastLocation) return null;

    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { address: true },
    });
    if (!booking) throw AppError.notFound("Booking not found");

    const result = await mapsDistanceService.getDistanceAndDuration(
      { lat: lastLocation.lat, lng: lastLocation.lng },
      { lat: Number(booking.address.lat), lng: Number(booking.address.lng) }
    );

    return {
      distanceKm: result.distanceKm,
      etaMinutes: result.durationMinutes,
      lastLocationTimestamp: lastLocation.timestamp,
    };
  },
};
