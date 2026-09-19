export function authenticate(req, res, next) {
  const secret = process.env.BACKEND_SECRET;

  if (!secret) {
    console.error('[AUTH] BACKEND_SECRET is not set in environment — rejecting request');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const header = req.headers.authorization;

  if (!header) {
    console.warn(`[AUTH] Rejected request from ${req.ip} — Missing Authorization header`);
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  if (header !== `Bearer ${secret}`) {
    console.warn(`[AUTH] Rejected request from ${req.ip} — Invalid Bearer secret`);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  console.log(`[AUTH] Client ${req.ip} authenticated successfully`);
  next();
}
