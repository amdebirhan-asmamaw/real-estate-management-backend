import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { runWithRequestContext } from "../utils/requestContext";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const parseRequestId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] || randomUUID() : value || randomUUID();

export const requestId = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const id = parseRequestId(req.headers["x-request-id"]);
  req.requestId = id;
  res.setHeader("x-request-id", id);

  runWithRequestContext({ requestId: id }, next);
};
