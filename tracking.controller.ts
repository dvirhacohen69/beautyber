import { Request, Response } from "express";
import { AppError } from "@modules/common/errors/AppError";
import { assertCanAccessBookingTracking } from "../services/trackingAccess.service";
import { trackingLocationService } from "../services/trackingLocation.service";
import { etaService } from "../services/eta.service";
import { LOCATION_UPDATE_STATUSES } from "../constants/tracking.constants";
import { LocationUpdateDto } from "../dto/tracking.dto";

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const trackingController = {
  /** GET /tracking/:bookingId/location — המיקום האחרון הידוע (מה-Cache) */
  async getLocation(req: Request<{ bookingId: string }>, res: Response) {
    const user = requireUser(req);
    await assertCanAccessBookingTracking(user, req.params.bookingId);
    const location = await trackingLocationService.getLastLocation(req.params.bookingId);
    res.status(200).json({ data: location });
  },

  /** GET /tracking/:bookingId/eta */
  async getEta(req: Request<{ bookingId: string }>, res: Response) {
    const user = requireUser(req);
    await assertCanAccessBookingTracking(user, req.params.bookingId);
    const eta = await etaService.calculateEta(req.params.bookingId);
    res.status(200).json({ data: eta });
  },

  /**
   * POST /tracking/:bookingId/location — Fallback REST לעדכון מיקום,
   * בנוסף לערוץ ה-WebSocket. שימושי לבדיקות ידניות (curl) או לרגעים
   * בהם חיבור ה-WebSocket של אפליקציית הספק אינו זמין זמנית.
   */
  async postLocation(
    req: Request<{ bookingId: string }, unknown, LocationUpdateDto>,
    res: Response
  ) {
    const user = requireUser(req);
    if (user.role !== "provider") {
      throw AppError.forbidden("Only providers can report location");
    }

    const booking = await assertCanAccessBookingTracking(user, req.params.bookingId);
    if (!LOCATION_UPDATE_STATUSES.includes(booking.status)) {
      throw AppError.conflict("Booking is not in an active tracking window");
    }

    const accepted = await trackingLocationService.recordLocation(req.params.bookingId, req.body);
    if (!accepted) {
      throw AppError.badRequest("Location update rejected (implausible speed detected)");
    }

    res.status(200).json({ data: { accepted: true } });
  },
};
