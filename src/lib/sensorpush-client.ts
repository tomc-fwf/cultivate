const SENSORPUSH_BASE = 'https://api.sensorpush.com/api/v1';

export class SensorPushClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  async authenticate(): Promise<void> {
    const email = process.env.SENSORPUSH_EMAIL;
    const password = process.env.SENSORPUSH_PASSWORD;
    if (!email || !password) throw new Error('SENSORPUSH_EMAIL and SENSORPUSH_PASSWORD required');

    // Step 1: Get authorization code
    const authRes = await fetch(`${SENSORPUSH_BASE}/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!authRes.ok) throw new Error(`SensorPush auth failed: ${authRes.status}`);
    const { authorization } = await authRes.json() as { authorization: string };

    // Step 2: Exchange for access token
    const tokenRes = await fetch(`${SENSORPUSH_BASE}/oauth/accesstoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorization }),
    });
    if (!tokenRes.ok) throw new Error(`SensorPush token exchange failed: ${tokenRes.status}`);
    const { accesstoken } = await tokenRes.json() as { accesstoken: string };
    this.accessToken = accesstoken;
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000; // 55 min (tokens last ~60 min)
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() > this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    await this.ensureAuth();
    const res = await fetch(`${SENSORPUSH_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.accessToken!,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      // Token may have expired early — clear and retry once
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      await this.ensureAuth();
      const retryRes = await fetch(`${SENSORPUSH_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.accessToken!,
        },
        body: JSON.stringify(body),
      });
      if (!retryRes.ok) throw new Error(`SensorPush API error ${retryRes.status}: ${await retryRes.text()}`);
      return retryRes.json();
    }
    if (!res.ok) throw new Error(`SensorPush API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getSensors(): Promise<Record<string, unknown>> {
    return this.apiPost('/devices/sensors', {}) as Promise<Record<string, unknown>>;
  }

  async getSamples(sensorIds: string[], startTime: string, limit = 100): Promise<Record<string, unknown>> {
    return this.apiPost('/samples', {
      sensors: Object.fromEntries(sensorIds.map(id => [id, {}])),
      startTime,
      limit,
    }) as Promise<Record<string, unknown>>;
  }
}

// Singleton for use across the app
export const sensorPushClient = new SensorPushClient();
