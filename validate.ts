import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";

interface ValidationSchemas {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/**
 * Middleware ולידציה גנרי: מקבל סכמות Zod עבור body/query/params,
 * מריץ פרסינג (שזורק ZodError שנתפס ע"י errorHandler), ומחליף את
 * req.body/query/params בגרסה המפורסרת (עם ברירות מחדל/coercion).
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as typeof req.query;
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    next();
  };
}
