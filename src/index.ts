import { Hono } from 'hono';
import { HmacSHA256, enc } from 'crypto-js';
import { handleLineWebhook } from './line/webhook';
import { Env } from './types';
import { MCPServer } from './mcp/server';
import { 
  handleLogin, 
  handleLogout, 
  getDashboardStats,
  getDocuments,
  getDocument,
  deleteDocument,
  getUsers,
  getUserConversations,
  getMCPStats,
  getSystemSettings,
  updateSystemSettings
} from './admin/api';
// import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.text('LINE RAG Bot with MCP Server is running!');
});

// MCP Serverエンドポイント
app.all('/mcp', async (c) => {
  const id = c.env.MCP_SERVER.idFromName('main');
  const stub = c.env.MCP_SERVER.get(id);
  return stub.fetch(c.req.raw);
});

app.all('/mcp/*', async (c) => {
  const id = c.env.MCP_SERVER.idFromName('main');
  const stub = c.env.MCP_SERVER.get(id);
  return stub.fetch(c.req.raw);
});

// 管理画面の静的ファイル配信
app.get('/admin', async (c) => {
  // GitHubから直接HTMLを取得
  try {
    const html = await fetch('https://raw.githubusercontent.com/yukihamada/line-rag-bot/master/admin.html');
    if (html.ok) {
      return new Response(await html.text(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  } catch (error) {
    console.error('Failed to fetch admin.html:', error);
  }
  
  // フォールバック: シンプルなリダイレクトページ
  return c.html(`
    <!DOCTYPE html>
    <html><head><title>Admin</title></head>
    <body>
      <h1>LINE RAG Bot 管理画面</h1>
      <p>管理画面の読み込みに失敗しました。</p>
      <p><a href="https://github.com/yukihamada/line-rag-bot/blob/master/admin.html">管理画面ソース</a>を直接アクセスしてください。</p>
    </body></html>
  `);
});

// 管理画面API
app.post('/admin/login', handleLogin);
app.post('/admin/logout', handleLogout);
app.get('/admin/api/dashboard', getDashboardStats);
app.get('/admin/api/documents', getDocuments);
app.get('/admin/api/documents/:id', getDocument);
app.delete('/admin/api/documents/:id', deleteDocument);
app.get('/admin/api/users', getUsers);
app.get('/admin/api/users/:userId/conversations', getUserConversations);
app.get('/admin/api/mcp/stats', getMCPStats);
app.get('/admin/api/settings', getSystemSettings);
app.post('/admin/api/settings', updateSystemSettings);

app.post('/webhook', async (c) => {
  const signature = c.req.header('x-line-signature');
  if (!signature) {
    return c.text('Bad Request', 400);
  }

  const body = await c.req.text();
  
  const hash = HmacSHA256(body, c.env.LINE_CHANNEL_SECRET).toString(enc.Base64);
  if (signature !== hash) {
    return c.text('Unauthorized', 401);
  }

  try {
    const events = JSON.parse(body);
    const ctx = c.executionCtx as any as ExecutionContext;
    await handleLineWebhook(events, c.env, ctx);
    return c.text('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    return c.text('Internal Server Error', 500);
  }
});

export default app;

// Durable Object export
export { MCPServer };