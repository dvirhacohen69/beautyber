import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  tipAmount: z.number().min(0).max(1000).optional(),
});
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
