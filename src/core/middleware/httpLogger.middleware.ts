import { Request, Response, NextFunction } from "express";
import { logHttpRequest } from "../utils/logger";

export const httpLogger = (req: Request, _res: Response, next: NextFunction): void => {
  logHttpRequest({
    method:      req.method,
    host:        req.hostname,
    protocol:    req.protocol,
    port:        req.socket.localPort,
    path:        req.path,
    originalUrl: req.originalUrl,
    baseUrl:     req.baseUrl,
    query:       req.query as Record<string, unknown>,
    ip:          req.ip,
    ips:         req.ips,
    secure:      req.secure,
    body:        req.body as unknown,
    cookies: {
      accessToken:  req.cookies?.access_token  ? "[Present]" : "[Not Present]",
      refreshToken: req.cookies?.refresh_token ? "[Present]" : "[Not Present]",
    },
  });

  next();
};
