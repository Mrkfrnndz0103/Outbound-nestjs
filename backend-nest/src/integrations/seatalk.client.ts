import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class SeaTalkClient {
  private accessToken?: { value: string; expiresAt: number };

  configuredForApprovals() {
    return Boolean(
      process.env.SEATALK_BASE_URL &&
      process.env.SEATALK_APP_ID &&
      process.env.SEATALK_APP_SECRET &&
      process.env.SEATALK_TOKEN_URL &&
      process.env.SEATALK_APPROVAL_CREATE_PATH,
    );
  }

  async createApprovalItem(payload: Record<string, unknown>) {
    const token = await this.getAccessToken();
    const result = await this.request<{ code?: number; message?: string }>(
      process.env.SEATALK_APPROVAL_CREATE_PATH!,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (result.code !== undefined && result.code !== 0) {
      throw new ServiceUnavailableException(`SeaTalk rejected the approval item with code ${result.code}.`);
    }
    return result;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const baseUrl = process.env.SEATALK_BASE_URL;
    if (!baseUrl) throw new ServiceUnavailableException('SeaTalk is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.SEATALK_HTTP_TIMEOUT_MS ?? 10_000));
    try {
      const response = await fetch(new URL(path, baseUrl), { ...init, signal: controller.signal });
      if (!response.ok) throw new ServiceUnavailableException(`SeaTalk request failed with ${response.status}.`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const appId = process.env.SEATALK_APP_ID;
    const appSecret = process.env.SEATALK_APP_SECRET;
    const tokenUrl = process.env.SEATALK_TOKEN_URL;
    if (!appId || !appSecret || !tokenUrl) throw new ServiceUnavailableException('SeaTalk credentials are not configured.');
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal: AbortSignal.timeout(Number(process.env.SEATALK_HTTP_TIMEOUT_MS ?? 10_000)),
    });
    if (!response.ok) throw new ServiceUnavailableException(`SeaTalk token request failed with ${response.status}.`);
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      data?: { access_token?: string; expires_in?: number };
    };
    const value = body.access_token ?? body.data?.access_token;
    if (!value) throw new ServiceUnavailableException('SeaTalk token response did not include an access token.');
    const expiresIn = body.expires_in ?? body.data?.expires_in ?? 7_200;
    this.accessToken = { value, expiresAt: Date.now() + expiresIn * 1000 };
    return value;
  }
}
