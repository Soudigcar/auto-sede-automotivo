declare function fetch(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, 'headers'> & {
    headers?: HeadersInit | Record<string, string | undefined>;
  }
): Promise<Response>;
