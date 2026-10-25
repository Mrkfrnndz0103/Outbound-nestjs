import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class SeaTalkClient {
  private readonly baseUrl = process.env.SEATALK_BASE_URL;

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) throw new ServiceUnavailableException('SeaTalk is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(new URL(path, this.baseUrl), { ...init, signal: controller.signal });
      if (!response.ok) throw new ServiceUnavailableException(`SeaTalk request failed with ${response.status}.`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
