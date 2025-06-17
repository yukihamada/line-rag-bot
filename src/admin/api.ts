import { Context } from 'hono';
import { Env } from '../types';
import { requireSessionAuth } from './auth';

// ダッシュボード統計取得
export async function getDashboardStats(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  try {
    // 基本統計
    const totalUsers = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT user_id) as count FROM memory'
    ).first<{ count: number }>();

    const totalMessages = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM memory'
    ).first<{ count: number }>();

    const totalDocuments = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM documents WHERE vector_indexed = TRUE'
    ).first<{ count: number }>();

    // 今日のアクティビティ
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayActivity = await c.env.DB.prepare(
      'SELECT COUNT(*) as messages, COUNT(DISTINCT user_id) as active_users FROM memory WHERE created_at >= ?'
    ).bind(new Date(todayStart).toISOString()).first();

    // 週別統計
    const weeklyStats = await c.env.DB.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as messages,
        COUNT(DISTINCT user_id) as users
      FROM memory 
      WHERE created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all();

    // 人気のあるトピック（簡易版）
    const popularTopics = await c.env.DB.prepare(`
      SELECT 
        substr(content, 1, 50) as topic,
        COUNT(*) as count
      FROM memory 
      WHERE role = 'user' AND created_at >= DATE('now', '-7 days')
      GROUP BY substr(content, 1, 50)
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return c.json({
      overview: {
        totalUsers: totalUsers?.count || 0,
        totalMessages: totalMessages?.count || 0,
        totalDocuments: totalDocuments?.count || 0,
        todayMessages: todayActivity?.messages || 0,
        todayActiveUsers: todayActivity?.active_users || 0,
      },
      weeklyStats: weeklyStats.results,
      popularTopics: popularTopics.results,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch dashboard stats' }, 500);
  }
}

// ドキュメント一覧取得
export async function getDocuments(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const documents = await c.env.DB.prepare(`
      SELECT id, doc_id, title, 
             length(content) as content_length,
             vector_indexed,
             created_at, updated_at
      FROM documents 
      ORDER BY updated_at DESC 
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM documents'
    ).first<{ count: number }>();

    return c.json({
      documents: documents.results,
      pagination: {
        page,
        limit,
        total: total?.count || 0,
        pages: Math.ceil((total?.count || 0) / limit),
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch documents' }, 500);
  }
}

// ドキュメント詳細取得
export async function getDocument(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  const id = c.req.param('id');
  
  try {
    const document = await c.env.DB.prepare(
      'SELECT * FROM documents WHERE id = ?'
    ).bind(id).first();

    if (!document) {
      return c.json({ error: 'Document not found' }, 404);
    }

    return c.json({ document });
  } catch (error) {
    return c.json({ error: 'Failed to fetch document' }, 500);
  }
}

// ドキュメント削除
export async function deleteDocument(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM documents WHERE id = ?'
    ).bind(id).run();

    if (result.changes === 0) {
      return c.json({ error: 'Document not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete document' }, 500);
  }
}

// ユーザー一覧取得
export async function getUsers(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  try {
    const users = await c.env.DB.prepare(`
      SELECT 
        user_id,
        COUNT(*) as message_count,
        MAX(created_at) as last_activity,
        MIN(created_at) as first_activity
      FROM memory 
      GROUP BY user_id 
      ORDER BY last_activity DESC
    `).all();

    return c.json({ users: users.results });
  } catch (error) {
    return c.json({ error: 'Failed to fetch users' }, 500);
  }
}

// ユーザーの会話履歴取得
export async function getUserConversations(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  const userId = c.req.param('userId');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = (page - 1) * limit;
  
  try {
    const conversations = await c.env.DB.prepare(`
      SELECT role, content, created_at
      FROM memory 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();

    const total = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM memory WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();

    return c.json({
      conversations: conversations.results,
      pagination: {
        page,
        limit,
        total: total?.count || 0,
        pages: Math.ceil((total?.count || 0) / limit),
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch conversations' }, 500);
  }
}

// MCP統計取得
export async function getMCPStats(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  try {
    // MCP Serverから統計を取得
    const mcpId = c.env.MCP_SERVER.idFromName('main');
    const mcpStub = c.env.MCP_SERVER.get(mcpId);
    
    const response = await mcpStub.fetch(new Request('http://localhost/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'stats-1',
        method: 'stats/get'
      })
    }));

    const stats = await response.json();
    return c.json(stats);
  } catch (error) {
    return c.json({ 
      error: 'Failed to fetch MCP stats',
      tools: 4,
      resources: 3,
      prompts: 2,
      connections: 0
    });
  }
}

// システム設定取得
export async function getSystemSettings(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  return c.json({
    llm: {
      model: '@cf/meta/llama-3-70b-instruct',
      temperature: 0.7,
      maxTokens: 2048,
    },
    embedding: {
      model: '@cf/baai/bge-base-en-v1.5',
    },
    rag: {
      vectorSearchLimit: 4,
      conversationHistoryLimit: 10,
    },
    mcp: {
      enabled: !!c.env.MCP_SERVER_URL,
      serverUrl: c.env.MCP_SERVER_URL || null,
    },
  });
}

// システム設定更新
export async function updateSystemSettings(c: Context<{ Bindings: Env }>) {
  const authError = await requireSessionAuth(c);
  if (authError) return authError;

  const settings = await c.req.json();
  
  // 設定をKVに保存
  await c.env.KV.put('system-settings', JSON.stringify(settings));
  
  return c.json({ success: true });
}