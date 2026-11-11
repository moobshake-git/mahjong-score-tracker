import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { setAuthCookie, clearAuthCookie, requireAuth } from '../auth.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function authRouter(db) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const user = { id: Number(lastInsertRowid), username };
    setAuthCookie(res, user);
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    const row = typeof username === 'string' ? db.prepare('SELECT * FROM users WHERE username = ?').get(username) : null;
    if (!row || typeof password !== 'string' || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    const user = { id: row.id, username: row.username };
    setAuthCookie(res, user);
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
