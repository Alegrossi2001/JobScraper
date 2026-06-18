import axios, { AxiosRequestConfig } from 'axios';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
};

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await axios.get<T>(url, {
    timeout: 30_000,
    headers: { ...DEFAULT_HEADERS, ...config?.headers },
    ...config,
  });
  return res.data;
}

export async function post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await axios.post<T>(url, data, {
    timeout: 30_000,
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/json',
      ...config?.headers,
    },
    ...config,
  });
  return res.data;
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) {
        await sleep(1_000 * Math.pow(2, i) + Math.random() * 500);
      }
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
