import { z } from "zod";

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(50),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  fullAddressText: z.string().trim().min(1).max(300),
  isDefault: z.boolean().optional().default(false),
});
export type CreateAddressDto = z.infer<typeof createAddressSchema>;
