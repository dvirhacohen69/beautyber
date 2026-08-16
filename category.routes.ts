import { Router } from "express";
import { categoryController } from "../controllers/category.controller";
import { asyncHandler } from "@modules/common/utils/asyncHandler";

const router = Router();

// ציבורי במכוון - עיון בקטלוג קטגוריות לא דורש התחברות
router.get("/", asyncHandler(categoryController.list));

export { router as categoryRouter };
