import { Router } from "express";
import { addressController } from "../controllers/address.controller";
import { authenticate } from "@modules/auth/middleware/authenticate";
import { validate } from "@modules/common/middleware/validate";
import { asyncHandler } from "@modules/common/utils/asyncHandler";
import { createAddressSchema } from "../dto/address.dto";

const router = Router();

router.use(authenticate); // כל נתיבי /users/me דורשים משתמש מחובר

router.get("/me/addresses", asyncHandler(addressController.list));

router.post(
  "/me/addresses",
  validate({ body: createAddressSchema }),
  asyncHandler(addressController.create)
);

export { router as userRouter };
