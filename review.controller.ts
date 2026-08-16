import { Request, Response } from "express";
import { reviewService } from "../services/review.service";
import { AppError } from "@modules/common/errors/AppError";
import { CreateReviewDto } from "../dto/review.dto";

export const reviewController = {
  async create(req: Request<{ bookingId: string }, unknown, CreateReviewDto>, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const review = await reviewService.create(req.user.userId, req.params.bookingId, req.body);
    res.status(201).json({ data: review });
  },
};
