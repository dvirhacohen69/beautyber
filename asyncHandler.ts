import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * עוטף Controller אסינכרוני כדי שכל שגיאה (throw / Promise rejection)
 * תעבור אוטומטית ל-next(err) ותטופל ע"י ה-errorHandler הגלובלי,
 * במקום לגרום ל-unhandled rejection.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
