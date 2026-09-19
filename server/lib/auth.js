export function authenticate(req, res, next) {
  const secret = process.env.BACKEND_SECRET;

  if (!secret) {
    console.error('[AUTH] BACKEND_SECRET is not set — rejecting all requests');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const header = req.headers.authorization;

  if (!header || header !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
