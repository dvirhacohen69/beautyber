import { Request, Response } from "express";
import { bookingService } from "../services/booking.service";
import { AppError } from "@modules/common/errors/AppError";
import {
  CancelBookingDto,
  CreateBookingDto,
  QuoteRequestDto,
  ReportNoShowDto,
  UpdateBookingStatusDto,
} from "../dto/booking.dto";

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const bookingController = {
  async getQuote(req: Request<unknown, unknown, QuoteRequestDto>, res: Response) {
    const user = requireUser(req);
    const quote = await bookingService.createQuote(user.userId, req.body);
    res.status(200).json({ data: quote });
  },

  async create(req: Request<unknown, unknown, CreateBookingDto>, res: Response) {
    const user = requireUser(req);
    const booking = await bookingService.createBooking(user.userId, req.body);
    res.status(201).json({ data: booking });
  },

  async list(req: Request, res: Response) {
    const user = requireUser(req);
    const bookings = await bookingService.listForUser(user);
    res.status(200).json({ data: bookings });
  },

  async getById(req: Request<{ bookingId: string }>, res: Response) {
    const user = requireUser(req);
    const booking = await bookingService.getById(user, req.params.bookingId);
    res.status(200).json({ data: booking });
  },

  async confirm(req: Request<{ bookingId: string }>, res: Response) {
    const user = requireUser(req);
    const booking = await bookingService.confirmBooking(user.userId, req.params.bookingId);
    res.status(200).json({ data: booking });
  },

  async reject(req: Request<{ bookingId: string }, unknown, CancelBookingDto>, res: Response) {
    const user = requireUser(req);
    const booking = await bookingService.rejectBooking(
      user.userId,
      req.params.bookingId,
      req.body.reason
    );
    res.status(200).json({ data: booking });
  },

  async updateStatus(
    req: Request<{ bookingId: string }, unknown, UpdateBookingStatusDto>,
    res: Response
  ) {
    const user = requireUser(req);
    const booking = await bookingService.updateStatus(
      user.userId,
      req.params.bookingId,
      req.body
    );
    res.status(200).json({ data: booking });
  },

  async cancel(req: Request<{ bookingId: string }, unknown, CancelBookingDto>, res: Response) {
    const user = requireUser(req);
    const booking = await bookingService.cancelBooking(user, req.params.bookingId, req.body.reason);
    res.status(200).json({ data: booking });
  },

  async reportNoShow(
    req: Request<{ bookingId: string }, unknown, ReportNoShowDto>,
    res: Response
  ) {
    const user = requireUser(req);
    const booking = await bookingService.reportNoShow(
      user,
      req.params.bookingId,
      req.body.reason
    );
    res.status(200).json({ data: booking });
  },
};
