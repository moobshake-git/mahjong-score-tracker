// Central place for configuration read from environment variables (.env at repo root).
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change-me') {
  if (isProd) {
    throw new Error('JWT_SECRET must be set in production.');
  }
  // Dev fallback: random per process, so logins reset when the server restarts.
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using a random dev secret (logins reset on restart).');
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  jwtSecret,
  databasePath: process.env.DATABASE_PATH || './data/mahjong.db',
  llm: {
    apiKey: process.env.OPENCODE_API_KEY || '',
    baseUrl: (process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, ''),
    model: process.env.OPENCODE_MODEL || 'kimi-k2.6',
  },
};
