import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { noStore } from './no-store.middleware';

function fakeResponse(): { response: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  return { response, headers };
}

describe('noStore', () => {
  it('tells every cache not to store the response', () => {
    const { response, headers } = fakeResponse();

    noStore({} as Request, response, vi.fn());

    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('covers the HTTP/1.0 caches that predate Cache-Control', () => {
    const { response, headers } = fakeResponse();

    noStore({} as Request, response, vi.fn());

    expect(headers['Pragma']).toBe('no-cache');
  });

  it('passes the request on, so it is a header pass and nothing else', () => {
    const { response } = fakeResponse();
    const next = vi.fn();

    noStore({} as Request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
