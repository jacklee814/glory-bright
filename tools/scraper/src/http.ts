/** 舊站主機在請求過密時回傳 HTTP 200 但內容為 HiNet WFS 攔截頁，必須視為失敗。 */
export class InterceptError extends Error {
  constructor(url: string) { super(`舊站回傳 HiNet 攔截頁，請加大間隔後重試：${url}`); this.name = 'InterceptError'; }
}
export class HttpError extends Error {
  constructor(url: string, status: number) { super(`HTTP ${status}：${url}`); this.name = 'HttpError'; }
}

export function isInterceptPage(html: string): boolean {
  if (html.trim().length === 0) return true;
  return html.includes('wfs.hinet.net');
}

export class RateLimiter {
  #next = 0;
  constructor(private readonly minIntervalMs: number) {}
  async wait(): Promise<void> {
    const delay = this.#next - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    this.#next = Date.now() + this.minIntervalMs;
  }
}

const USER_AGENT = 'Mozilla/5.0 (compatible; GloryBrightMigration/1.0)';
/** 舊站是 Apache 1.3.39 且受 HiNet 流量管控，間隔取 3 秒。 */
export const limiter = new RateLimiter(3000);

async function request(url: string): Promise<Response> {
  await limiter.wait();
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!response.ok) throw new HttpError(url, response.status);
  return response;
}

/** 舊站是 UTF-8 with BOM，去掉 BOM 以免污染第一個標籤。 */
async function readText(response: Response): Promise<string> {
  return (await response.text()).replace(/^﻿/, '');
}

export async function fetchText(url: string, options: { retries?: number } = {}): Promise<string> {
  const retries = options.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const html = await readText(await request(url));
      if (isInterceptPage(html)) throw new InterceptError(url);
      return html;
    } catch (error) {
      if (attempt >= retries) throw error;
      // 被攔截時退避時間加倍，其他錯誤固定退避。
      const backoff = error instanceof InterceptError ? 60_000 * (attempt + 1) : 5_000;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

export async function fetchBinary(url: string): Promise<Buffer> {
  const response = await request(url);
  return Buffer.from(await response.arrayBuffer());
}
