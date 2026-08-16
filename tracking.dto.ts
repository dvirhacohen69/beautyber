import { z } from "zod";

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LocationUpdateDto = z.infer<typeof locationUpdateSchema>;

export const trackingParamsSchema = z.object({
  bookingId: z.string().uuid(),
});
