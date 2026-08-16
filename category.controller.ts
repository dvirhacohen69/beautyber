import { Request, Response } from "express";
import { categoryService } from "../services/category.service";

export const categoryController = {
  async list(_req: Request, res: Response) {
    const categories = await categoryService.listActive();
    res.status(200).json({ data: categories });
  },
};
