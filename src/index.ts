import { Hono } from 'hono';
import { HmacSHA256, enc } from 'crypto-js';
import { handleLineWebhook } from './line/webhook';
import { Env } from './types';
import { MCPServer } from './mcp/server';

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