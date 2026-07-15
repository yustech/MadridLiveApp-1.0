import express from "express";

export function isLocalRequest(req: express.Request) {
  const remoteAddress = req.socket.remoteAddress || '';
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

export function isAdminAuthorized(req: express.Request) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) return false;
  const providedToken = req.header("x-admin-token");
  return providedToken === expectedToken;
}

export function unauthorizedResponse(res: express.Response) {
  return res.status(401).json({ success: false, message: "Unauthorized." });
}
