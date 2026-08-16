import { Router } from "express";
import { bookingController } from "../controllers/booking.controller";
import { reviewController } from "@modules/reviews/controllers/review.controller";
import { authenticate } from "@modules/auth/middleware/authenticate";
import { authorize } from "@modules/auth/middleware/authorize";
import { validate } from "@modules/common/middleware/validate";
import { asyncHandler } from "@modules/common/utils/asyncHandler";
import {
  bookingIdParamsSchema,
  cancelBookingSchema,
  createBookingSchema,
  quoteRequestSchema,
  reportNoShowSchema,
  updateBookingStatusSchema,
} from "../dto/booking.dto";
import { createReviewSchema } from "@modules/reviews/dto/review.dto";

const router = Router();

// כל נתיבי ההזמנות דורשים משתמש מחובר
router.use(authenticate);

// ---- Pricing ----
router.post(
  "/quote",
  authorize("client"),
  validate({ body: quoteRequestSchema }),
  asyncHandler(bookingController.getQuote)
);

// ---- Create ----
router.post(
  "/",
  authorize("client"),
  validate({ body: createBookingSchema }),
  asyncHandler(bookingController.create)
);

// ---- Read ----
// שים לב: /me חייב להיות מוגדר לפני /:bookingId, אחרת "me" ייתפס כ-bookingId
router.get("/me", asyncHandler(bookingController.list));

router.get(
  "/:bookingId",
  validate({ params: bookingIdParamsSchema }),
  asyncHandler(bookingController.getById)
);

// ---- Provider actions ----
router.patch(
  "/:bookingId/confirm",
  authorize("provider"),
  validate({ params: bookingIdParamsSchema }),
  asyncHandler(bookingController.confirm)
);

router.patch(
  "/:bookingId/reject",
  authorize("provider"),
  validate({ params: bookingIdParamsSchema, body: cancelBookingSchema }),
  asyncHandler(bookingController.reject)
);

router.patch(
  "/:bookingId/status",
  authorize("provider"),
  validate({ params: bookingIdParamsSchema, body: updateBookingStatusSchema }),
  asyncHandler(bookingController.updateStatus)
);

// ---- Client + Provider actions ----
router.patch(
  "/:bookingId/cancel",
  authorize("client", "provider"),
  validate({ params: bookingIdParamsSchema, body: cancelBookingSchema }),
  asyncHandler(bookingController.cancel)
);

router.patch(
  "/:bookingId/no-show",
  authorize("client", "provider"),
  validate({ params: bookingIdParamsSchema, body: reportNoShowSchema }),
  asyncHandler(bookingController.reportNoShow)
);

// ---- Review + Tip (client, רק להזמנה שהושלמה - נאכף ב-review.service) ----
router.post(
  "/:bookingId/review",
  authorize("client"),
  validate({ params: bookingIdParamsSchema, body: createReviewSchema }),
  asyncHandler(reviewController.create)
);

export { router as bookingRouter };
