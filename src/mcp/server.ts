import { DurableObject } from 'cloudflare:workers';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPTool, 
  MCPResource,
  MCPPrompt,
  MCPInitializeRequest,
  MCPInitializeResponse 
} from './types';
import { searchDocuments } from '../langchain/vectorstore';
import { loadHistoryFromD1 } from '../langchain/memory';
import { Env } from '../types';

export class MCPServer extends DurableObject {
  private env: Env;
  private sessions: Map<string, WebSocket> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // WebSocket接続の処理
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      await this.handleWebSocketSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Server-Sent Events (SSE) のサポート
    if (url.pathname === '/sse') {
      return this.handleSSE();
    }

    // 通常のHTTPリクエスト
    if (request.method === 'POST') {
      const req: MCPRequest = await request.json();
      const res = await this.handleRequest(req);
      return Response.json(res);
    }

    return new Response('MCP Server is running', { status: 200 });
  }

  private async handleWebSocketSession(ws: WebSocket) {
    ws.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, ws);

    ws.addEventListener('message', async (event) => {
      try {
        const req: MCPRequest = JSON.parse(event.data as string);
        const res = await this.handleRequest(req);
        ws.send(JSON.stringify(res));
      } catch (error) {
        ws.send(JSON.stringify({
          id: 'error',
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }));
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(sessionId);
    });
  }

  private handleSSE(): Response {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // 定期的にツールリストの更新を送信
    const interval = setInterval(async () => {
      const event = `event: tools/list_changed\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
      await writer.write(encoder.encode(event));
    }, 30000);

    // クリーンアップ
    const cleanup = () => {
      clearInterval(interval);
      writer.close();
    };

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  private async handleRequest(req: MCPRequest): Promise<MCPResponse> {
    switch (req.method) {
      case 'initialize':
        return this.handleInitialize(req as MCPInitializeRequest);
      
      case 'tools/list':
        return this.handleToolsList(req);
      
      case 'tools/call':
        return this.handleToolCall(req);
      
      case 'resources/list':
        return this.handleResourcesList(req);
      
      case 'resources/read':
        return this.handleResourceRead(req);
      
      case 'prompts/list':
        return this.handlePromptsList(req);
      
      case 'prompts/get':
        return this.handlePromptGet(req);
      
      default:
        return {
          id: req.id,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        };
    }
  }

  private handleInitialize(req: MCPInitializeRequest): MCPInitializeResponse {
    return {
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
        },
        serverInfo: {
          name: 'line-rag-bot-mcp',
          version: '1.0.0',
        },
      },
    };
  }

  private handleToolsList(req: MCPRequest): MCPResponse {
    const tools: MCPTool[] = [
      {
        name: 'search_knowledge',
        description: 'Vectorize内のドキュメントから関連情報を検索',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '検索クエリ',
            },
            limit: {
              type: 'number',
              description: '検索結果の最大数',
              default: 4,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_conversation_history',
        description: 'ユーザーの会話履歴を取得',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'ユーザーID',
            },
            limit: {
              type: 'number',
              description: '取得する履歴の最大数',
              default: 10,
            },
          },
          required: ['userId'],
        },
      },
      {
        name: 'analyze_sentiment',
        description: 'テキストの感情分析を実行',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '分析するテキスト',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'web_search',
        description: '外部のWeb情報を検索',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '検索クエリ',
            },
            source: {
              type: 'string',
              enum: ['google', 'bing', 'duckduckgo'],
              default: 'duckduckgo',
            },
          },
          required: ['query'],
        },
      },
    ];

    return {
      id: req.id,
      result: { tools },
    };
  }

  private async handleToolCall(req: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = req.params;

    try {
      let result: any;

      switch (name) {
        case 'search_knowledge':
          result = await this.searchKnowledge(args.query, args.limit || 4);
          break;
        
        case 'get_conversation_history':
          result = await this.getConversationHistory(args.userId, args.limit || 10);
          break;
        
        case 'analyze_sentiment':
          result = await this.analyzeSentiment(args.text);
          break;
        
        case 'web_search':
          result = await this.webSearch(args.query, args.source || 'duckduckgo');
          break;
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        id: req.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      return {
        id: req.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Tool execution failed',
        },
      };
    }
  }

  private async searchKnowledge(query: string, limit: number) {
    const docs = await searchDocuments(this.env, query, limit);
    return docs.map(doc => ({
      content: doc.pageContent,
      metadata: doc.metadata,
    }));
  }

  private async getConversationHistory(userId: string, limit: number) {
    const messages = await loadHistoryFromD1(this.env.DB, userId, limit);
    return messages.map(msg => ({
      role: msg._getType(),
      content: msg.content,
    }));
  }

  private async analyzeSentiment(text: string) {
    // Workers AIを使用した感情分析
    const response = await this.env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
      text,
    });
    return response;
  }

  private async webSearch(query: string, source: string) {
    // 実際のWeb検索APIとの連携（例：DuckDuckGo API）
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
    const data = await response.json();
    return data;
  }

  private handleResourcesList(req: MCPRequest): MCPResponse {
    const resources: MCPResource[] = [
      {
        uri: 'rag://documents',
        name: 'Knowledge Base Documents',
        description: 'Vectorizeに登録されているドキュメント一覧',
        mimeType: 'application/json',
      },
      {
        uri: 'rag://conversations',
        name: 'Conversation History',
        description: '全ユーザーの会話履歴統計',
        mimeType: 'application/json',
      },
      {
        uri: 'rag://settings',
        name: 'Bot Settings',
        description: 'Botの設定情報',
        mimeType: 'application/json',
      },
    ];

    return {
      id: req.id,
      result: { resources },
    };
  }

  private async handleResourceRead(req: MCPRequest): Promise<MCPResponse> {
    const { uri } = req.params;

    try {
      let content: any;

      switch (uri) {
        case 'rag://documents':
          content = await this.getDocumentsList();
          break;
        
        case 'rag://conversations':
          content = await this.getConversationStats();
          break;
        
        case 'rag://settings':
          content = this.getBotSettings();
          break;
        
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }

      return {
        id: req.id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      return {
        id: req.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Resource read failed',
        },
      };
    }
  }

  private async getDocumentsList() {
    const result = await this.env.DB.prepare(
      'SELECT id, title, created_at FROM documents WHERE vector_indexed = TRUE'
    ).all();
    return result.results;
  }

  private async getConversationStats() {
    const stats = await this.env.DB.prepare(`
      SELECT 
        COUNT(DISTINCT user_id) as total_users,
        COUNT(*) as total_messages,
        MAX(created_at) as last_activity
      FROM memory
    `).first();
    return stats;
  }

  private getBotSettings() {
    return {
      model: '@cf/meta/llama-3-70b-instruct',
      embeddingModel: '@cf/baai/bge-base-en-v1.5',
      maxTokens: 2048,
      temperature: 0.7,
      vectorSearchLimit: 4,
      conversationHistoryLimit: 10,
    };
  }

  private handlePromptsList(req: MCPRequest): MCPResponse {
    const prompts: MCPPrompt[] = [
      {
        name: 'answer_with_context',
        description: 'コンテキストを考慮した回答生成',
        arguments: [
          {
            name: 'question',
            description: 'ユーザーからの質問',
            required: true,
          },
          {
            name: 'context',
            description: '関連するコンテキスト情報',
            required: false,
          },
        ],
      },
      {
        name: 'summarize_conversation',
        description: '会話履歴の要約生成',
        arguments: [
          {
            name: 'messages',
            description: '要約する会話メッセージの配列',
            required: true,
          },
        ],
      },
    ];

    return {
      id: req.id,
      result: { prompts },
    };
  }

  private handlePromptGet(req: MCPRequest): MCPResponse {
    const { name, arguments: args } = req.params;

    let messages: any[] = [];

    switch (name) {
      case 'answer_with_context':
        messages = [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `以下のコンテキストを使用して質問に答えてください。\n\nコンテキスト:\n${args.context || 'なし'}\n\n質問: ${args.question}`,
            },
          },
        ];
        break;
      
      case 'summarize_conversation':
        messages = [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `以下の会話を簡潔に要約してください:\n\n${JSON.stringify(args.messages)}`,
            },
          },
        ];
        break;
      
      default:
        return {
          id: req.id,
          error: {
            code: -32602,
            message: 'Unknown prompt name',
          },
        };
    }

    return {
      id: req.id,
      result: {
        description: `Prompt for ${name}`,
        messages,
      },
    };
  }
}