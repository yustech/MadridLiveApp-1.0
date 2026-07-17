export type MysqlRouteError = Error & { statusCode?: number; code?: string };

export function makeRouteError(statusCode: number, message: string, code?: string): MysqlRouteError {
  const error = new Error(message) as MysqlRouteError;
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}
