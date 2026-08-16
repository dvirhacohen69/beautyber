import { Request, Response } from "express";
import { addressService } from "../services/address.service";
import { AppError } from "@modules/common/errors/AppError";
import { CreateAddressDto } from "../dto/address.dto";

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const addressController = {
  async list(req: Request, res: Response) {
    const user = requireUser(req);
    const addresses = await addressService.list(user.userId);
    res.status(200).json({ data: addresses });
  },

  async create(req: Request<unknown, unknown, CreateAddressDto>, res: Response) {
    const user = requireUser(req);
    const address = await addressService.create(user.userId, req.body);
    res.status(201).json({ data: address });
  },
};
