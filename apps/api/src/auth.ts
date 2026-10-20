import type { Auth } from 'firebase-admin/auth';
import type { RequestHandler } from 'express';

const BEARER = /^Bearer (.+)$/;

/**
 * Accepts only requests carrying a Firebase ID token whose verified email is
 * on the allowlist (compared case-insensitively).
 */
export function requireAdmin(auth: Auth, adminEmails: string[]): RequestHandler {
  const allowed = new Set(adminEmails.map((email) => email.toLowerCase()));
  return async (req, res, next) => {
    const idToken = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!idToken) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const email = decoded.email?.toLowerCase();
    if (decoded.email_verified !== true || email === undefined || !allowed.has(email)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
