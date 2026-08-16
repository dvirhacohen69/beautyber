import { Router } from "express";
import { trackingController } from "../controllers/tracking.controller";
import { authenticate } from "@modules/auth/middleware/authenticate";
import { validate } from "@modules/common/middleware/validate";
import { asyncHandler } from "@modules/common/utils/asyncHandler";
import { locationUpdateSchema, trackingParamsSchema } from "../dto/tracking.dto";

const router = Router();

router.use(authenticate);

router.get(
  "/:bookingId/location",
  validate({ params: trackingParamsSchema }),
  asyncHandler(trackingController.getLocation)
);

router.get(
  "/:bookingId/eta",
  validate({ params: trackingParamsSchema }),
  asyncHandler(trackingController.getEta)
);

router.post(
  "/:bookingId/location",
  validate({ params: trackingParamsSchema, body: locationUpdateSchema }),
  asyncHandler(trackingController.postLocation)
);

export { router as trackingRouter };
