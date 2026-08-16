import { z } from "zod";

export const searchProvidersQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(100).optional().default(15),
  category_id: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  min_rating: z.coerce.number().min(0).max(5).optional(),
  sort_by: z.enum(["distance", "rating", "price"]).optional().default("distance"),
});
export type SearchProvidersQuery = z.infer<typeof searchProvidersQuerySchema>;

export const providerIdParamsSchema = z.object({
  providerId: z.string().uuid(),
});
