// Builds the Express app. Kept separate from index.js so tests can create an app with an in-memory DB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { lobbiesRouter } from './routes/lobbies.js';
import { aiRouter } from './routes/ai.js';

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db));
  app.use('/api/lobbies', lobbiesRouter(db));
  app.use('/api/ai', aiRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production, serve the built React app (npm run build) from client/dist.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Errors thrown in routes (including async ones - Express 5 catches those) end up here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (!err.status && !err.statusCode) console.error(err);
    // Only errors we created on purpose (they carry a status) show their message to the user.
    res.status(status).json({ error: err.status || err.statusCode ? err.message : 'Something went wrong.' });
  });

  return app;
}
