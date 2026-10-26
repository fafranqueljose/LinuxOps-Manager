async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/api')
    ? endpoint
    : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const data = await response.json();
      errorDetail = data.detail || data.message || errorDetail;
    } catch {
      // Body not JSON
    }
    const error = new Error(errorDetail);
    (error as any).status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T>(endpoint: string, init?: RequestInit): Promise<T> =>
    request<T>(endpoint, { method: 'GET', ...init }),

  post: <T = any>(endpoint: string, body?: any, init?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  put: <T = any>(endpoint: string, body?: any, init?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  patch: <T = any>(endpoint: string, body?: any, init?: RequestInit): Promise<T> =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  delete: <T = any>(endpoint: string, init?: RequestInit): Promise<T> =>
    request<T>(endpoint, { method: 'DELETE', ...init }),
};

