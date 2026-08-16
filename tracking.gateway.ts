import { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "@database/prisma";
import { tokenService } from "@modules/auth/services/token.service";
import { trackingLocationService } from "../services/trackingLocation.service";
import { locationUpdateSchema } from "../dto/tracking.dto";
import { TRACKABLE_JOIN_STATUSES, LOCATION_UPDATE_STATUSES } from "../constants/tracking.constants";

let ioInstance: SocketIOServer | null = null;

// תואם את נתיב ה-API שהוגדר באפיון: /ws/tracking/{booking_id}
const NAMESPACE_PATTERN = /^\/ws\/tracking\/([0-9a-fA-F-]{36})$/;

function extractBookingId(namespaceName: string): string | null {
  const match = namespaceName.match(NAMESPACE_PATTERN);
  return match ? match[1] : null;
}

/**
 * מרשם את ה-Tracking Gateway על שרת Socket.io קיים. נקרא פעם אחת
 * מ-server.ts באתחול. משתמש ב-Dynamic Namespace (Socket.io v4) כדי
 * שלכל הזמנה יהיה ערוץ מבודד משלה — אין צורך בניהול "rooms" ידני,
 * כי ה-Namespace עצמו כבר מבודד בין הזמנות שונות.
 */
export function registerTrackingGateway(io: SocketIOServer): void {
  ioInstance = io;

  const trackingNamespace = io.of(NAMESPACE_PATTERN);

  // ---- Auth Middleware: כל חיבור חייב Access Token תקין ----
  trackingNamespace.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      const payload = tokenService.verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  trackingNamespace.on("connection", (socket) => {
    void handleConnection(socket);
  });
}

async function handleConnection(socket: Socket): Promise<void> {
  const bookingId = extractBookingId(socket.nsp.name);
  if (!bookingId) {
    socket.emit("tracking_error", { message: "Invalid tracking channel" });
    socket.disconnect(true);
    return;
  }

  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking) {
    socket.emit("tracking_error", { message: "Booking not found" });
    socket.disconnect(true);
    return;
  }

  const isParticipant = await isBookingParticipant(socket.data.userId, socket.data.role, booking);
  if (!isParticipant) {
    socket.emit("tracking_error", { message: "You are not part of this booking" });
    socket.disconnect(true);
    return;
  }

  if (!TRACKABLE_JOIN_STATUSES.includes(booking.status)) {
    socket.emit("tracking_error", {
      message: "Tracking is not available for this booking's current status",
    });
    socket.disconnect(true);
    return;
  }

  socket.emit("tracking_ready", { bookingId, status: booking.status });

  // אם כבר קיים מיקום אחרון (למשל הלקוח מצטרף מאוחר יותר) — שולחים מיד
  const lastLocation = await trackingLocationService.getLastLocation(bookingId);
  if (lastLocation) {
    socket.emit("location_update", { bookingId, ...lastLocation });
  }

  socket.on("location_update", (payload: unknown) => {
    void handleLocationUpdate(socket, bookingId, payload);
  });
}

async function isBookingParticipant(
  userId: string,
  role: string,
  booking: { clientId: string; providerId: string }
): Promise<boolean> {
  if (role === "admin") return true;
  if (role === "client") return booking.clientId === userId;
  if (role === "provider") {
    const provider = await prisma.provider.findUnique({ where: { userId } });
    return !!provider && provider.providerId === booking.providerId;
  }
  return false;
}

async function handleLocationUpdate(socket: Socket, bookingId: string, payload: unknown): Promise<void> {
  // רק הספק משדר מיקום — הלקוח בערוץ הזה רק מאזין
  if (socket.data.role !== "provider") return;

  const booking = await prisma.booking.findUnique({ where: { bookingId } });
  if (!booking || !LOCATION_UPDATE_STATUSES.includes(booking.status)) {
    socket.emit("location_rejected", { reason: "booking_not_in_active_window" });
    return;
  }

  const parsed = locationUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    socket.emit("location_rejected", { reason: "invalid_payload" });
    return;
  }

  const accepted = await trackingLocationService.recordLocation(bookingId, parsed.data);
  if (!accepted) {
    socket.emit("location_rejected", { reason: "implausible_speed" });
    return;
  }

  // שידור לכל שאר המשתתפים בערוץ (בפועל: רק הלקוח, כי ה-Namespace מבודד להזמנה זו)
  socket.broadcast.emit("location_update", {
    bookingId,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    timestamp: Date.now(),
  });
}

/**
 * סוגר את ערוץ המעקב של הזמנה — נקרא ע"י booking.service ברגע שההזמנה
 * עוברת לסטטוס סופי (completed/cancelled_*/no_show). מנתק את כל
 * המשתתפים ומודיע להם על הסגירה, כדי שהאפליקציות ידעו להפסיק להאזין.
 */
export function closeTrackingRoom(bookingId: string): void {
  if (!ioInstance) return;

  const nsp = ioInstance.of(`/ws/tracking/${bookingId}`);
  nsp.emit("tracking_closed", { bookingId, reason: "booking_ended" });
  nsp.disconnectSockets(true);
}
