import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler<T extends Request = Request> = (
  req: T,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const catchAsync = <T extends Request = Request>(fn: AsyncHandler<T>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    (fn as AsyncHandler)(req, res, next).catch(next);
  };
};
