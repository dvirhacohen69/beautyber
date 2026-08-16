import { z } from "zod";

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ message: "Must be a valid ISO 8601 datetime" });

export const quoteRequestSchema = z.object({
  providerServiceId: uuid,
  addressId: uuid,
  scheduledStartTime: isoDateTime.optional(),
});
export type QuoteRequestDto = z.infer<typeof quoteRequestSchema>;

export const createBookingSchema = z.object({
  providerServiceId: uuid,
  addressId: uuid,
  scheduledStartTime: isoDateTime,
  paymentMethodId: uuid.optional(),
});
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

export const bookingIdParamsSchema = z.object({
  bookingId: uuid,
});

// רק סטטוסים שהספק מקדם ידנית דרך /status — pending/confirmed/cancelled/no_show
// מטופלים ע"י endpoints ייעודיים (confirm/reject/cancel/no-show) עם לוגיקה נפרדת.
const providerDrivenStatusSchema = z.enum([
  "provider_en_route",
  "arrived",
  "in_progress",
  "completed",
]);

export const updateBookingStatusSchema = z.object({
  status: providerDrivenStatusSchema,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type UpdateBookingStatusDto = z.infer<typeof updateBookingStatusSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelBookingDto = z.infer<typeof cancelBookingSchema>;

export const reportNoShowSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type ReportNoShowDto = z.infer<typeof reportNoShowSchema>;
