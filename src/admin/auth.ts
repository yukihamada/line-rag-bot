import { Context } from 'hono';
import { Env } from '../types';

// 簡易認証システム（本番環境では適切な認証を実装）
export async function requireAuth(c: Context<{ Bindings: Env }>) {
  const authHeader = c.req.header('Authorization');
  const adminKey = c.env.ADMIN_KEY;

  if (!adminKey) {
    return c.json({ error: 'Admin access not configured' }, 403);
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized - Bearer token required' }, 401);
  }

  const token = authHeader.split(' ')[1];
  if (token !== adminKey) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401);
  }

  return null; // 認証成功
}

// セッションベースの認証チェック（Cookie使用）
export async function requireSessionAuth(c: Context<{ Bindings: Env }>) {
  const sessionToken = c.req.cookie('admin-session');
  const adminKey = c.env.ADMIN_KEY;

  if (!adminKey || !sessionToken) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin Area"'
      }
    });
  }

  // セッショントークンの検証（KVストレージを使用）
  const storedSession = await c.env.KV.get(`session:${sessionToken}`);
  if (!storedSession) {
    return new Response('Session expired', { status: 401 });
  }

  return null; // 認証成功
}

// ログイン処理
export async function handleLogin(c: Context<{ Bindings: Env }>) {
  const { password } = await c.req.json();
  const adminKey = c.env.ADMIN_KEY;

  if (!adminKey || password !== adminKey) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // セッショントークン生成
  const sessionToken = crypto.randomUUID();
  const expireTime = Date.now() + 24 * 60 * 60 * 1000; // 24時間

  // セッションをKVに保存
  await c.env.KV.put(`session:${sessionToken}`, JSON.stringify({
    createdAt: Date.now(),
    expiresAt: expireTime,
  }), { expirationTtl: 24 * 60 * 60 });

  return c.json({ 
    success: true,
    sessionToken
  }, {
    headers: {
      'Set-Cookie': `admin-session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    }
  });
}

// ログアウト処理
export async function handleLogout(c: Context<{ Bindings: Env }>) {
  const sessionToken = c.req.cookie('admin-session');
  
  if (sessionToken) {
    await c.env.KV.delete(`session:${sessionToken}`);
  }

  return c.json({ success: true }, {
    headers: {
      'Set-Cookie': 'admin-session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    }
  });
}