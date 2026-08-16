import { Request, Response } from "express";
import { providerService } from "../services/provider.service";
import { SearchProvidersQuery } from "../dto/provider.dto";

export const providerController = {
  async search(req: Request<unknown, unknown, unknown, SearchProvidersQuery>, res: Response) {
    const results = await providerService.search(req.query);
    res.status(200).json({ data: results });
  },

  async getProfile(req: Request<{ providerId: string }>, res: Response) {
    const profile = await providerService.getPublicProfile(req.params.providerId);
    res.status(200).json({ data: profile });
  },

  async getReviews(req: Request<{ providerId: string }>, res: Response) {
    const reviews = await providerService.getReviews(req.params.providerId);
    res.status(200).json({ data: reviews });
  },
};
