import { NextFunction, Request, Response } from 'express';

/**
 * Tells every cache between the API and the caller not to keep the response.
 *
 * The routes here answer with personal data: a customer's document, address and phone, a work
 * order's history, a user's roles. Without an explicit directive, a shared proxy or the browser
 * decides for itself whether to store that, which is the weakness CWE-524 describes. The
 * assessment's dynamic scan reported it against this API before this existed.
 *
 * `no-store` is the strongest of the directives and the one that fits an API whose responses are
 * cheap to recompute and expensive to leak. `Pragma` is there for the HTTP/1.0 caches that
 * predate `Cache-Control`.
 */
export function noStore(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  next();
}
