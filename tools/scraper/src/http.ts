import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 舊站主機在請求過密時回傳 HTTP 200 但內容為 HiNet WFS 攔截頁，必須視為失敗。 */
export class InterceptError extends Error {
  constructor(url: string) { super(`舊站回傳 HiNet 攔截頁，請加大間隔後重試：${url}`); this.name = 'InterceptError'; }
}
export class HttpError extends Error {
  constructor(url: string, detail: string) { super(`抓取失敗：${url} — ${detail}`); this.name = 'HttpError'; }
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

/**
 * 以 curl 取代 Node 的 fetch。
 *
 * 舊站的 Apache 1.3.39 送出的 chunked encoding 不符 HTTP/1.1 規範，undici 會以
 * 「Invalid character in chunk size」中止連線並丟出 TypeError: terminated。curl
 * 對此較為寬容，能完整取回內容，因此傳輸層一律走 curl。
 */
async function request(url: string): Promise<Buffer> {
  await limiter.wait();
  try {
    const { stdout } = await run(
      'curl',
      ['-sS', '--fail', '--location', '--max-time', '45', '--user-agent', USER_AGENT, url],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new HttpError(url, stderr || String(error));
  }
}

export async function fetchText(url: string, options: { retries?: number } = {}): Promise<string> {
  const retries = options.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      // 舊站是 UTF-8 with BOM，去掉 BOM 以免污染第一個標籤。
      const html = (await request(url)).toString('utf8').replace(/^﻿/, '');
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
  return request(url);
}
