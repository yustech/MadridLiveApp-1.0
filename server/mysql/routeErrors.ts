export type MysqlRouteError = Error & { statusCode?: number };

export function makeRouteError(statusCode: number, message: string): MysqlRouteError {
  const error = new Error(message) as MysqlRouteError;
  error.statusCode = statusCode;
  return error;
}
