#!/bin/bash
# Prepare a demo repo for the GIF recording
set -e

DEMO_DIR="/tmp/ghostcommit-demo"
rm -rf "$DEMO_DIR"
mkdir -p "$DEMO_DIR/src"
cd "$DEMO_DIR"

git init -q
git commit --allow-empty -m "init" -q

cat > src/auth.ts << 'TSEOF'
import { verify, sign } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  role: 'admin' | 'user';
}

export function generateAccessToken(userId: string, role: string): string {
  return sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string): string {
  return sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
}

export function rotateRefreshToken(oldToken: string) {
  const payload = verify(oldToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
  return {
    access: generateAccessToken(payload.userId, payload.role),
    refresh: generateRefreshToken(payload.userId),
  };
}
TSEOF

cat > src/middleware.ts << 'TSEOF'
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = verify(token, process.env.JWT_SECRET!);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
TSEOF

git add src/

echo "Demo repo ready at $DEMO_DIR"
