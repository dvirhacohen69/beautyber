import { Router } from "express";
import { providerController } from "../controllers/provider.controller";
import { validate } from "@modules/common/middleware/validate";
import { asyncHandler } from "@modules/common/utils/asyncHandler";
import { providerIdParamsSchema, searchProvidersQuerySchema } from "../dto/provider.dto";

const router = Router();

// כל הנתיבים כאן ציבוריים במכוון (ללא authenticate) - עיון בקטלוג ספקים
// לא דורש התחברות, כמו בכל Marketplace צרכני.

// חשוב: "/search" חייב להירשם *לפני* "/:providerId", אחרת Express היה
// מזהה את המחרוזת "search" כאילו היא providerId.
router.get(
  "/search",
  validate({ query: searchProvidersQuerySchema }),
  asyncHandler(providerController.search)
);

router.get(
  "/:providerId",
  validate({ params: providerIdParamsSchema }),
  asyncHandler(providerController.getProfile)
);

router.get(
  "/:providerId/reviews",
  validate({ params: providerIdParamsSchema }),
  asyncHandler(providerController.getReviews)
);

export { router as providerRouter };
