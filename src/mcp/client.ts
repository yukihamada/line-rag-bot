import { MCPRequest, MCPResponse, MCPTool } from './types';
import { Env } from '../types';

export class MCPClient {
  private baseUrl: string;
  private ws?: WebSocket;
  private requestId: number = 0;
  private pendingRequests: Map<string, (response: MCPResponse) => void> = new Map();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.baseUrl);
      
      this.ws.onopen = () => {
        this.initialize().then(resolve).catch(reject);
      };

      this.ws.onmessage = (event) => {
        const response: MCPResponse = JSON.parse(event.data);
        const handler = this.pendingRequests.get(response.id);
        if (handler) {
          handler(response);
          this.pendingRequests.delete(response.id);
        }
      };

      this.ws.onerror = (error) => {
        reject(error);
      };
    });
  }

  async connectHTTP(): Promise<void> {
    // HTTP接続の場合は初期化のみ
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const response = await this.request({
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: [{
            uri: 'file:///line-rag-bot',
            name: 'LINE RAG Bot',
          }],
        },
        clientInfo: {
          name: 'line-rag-bot-client',
          version: '1.0.0',
        },
      },
    });

    if (response.error) {
      throw new Error(`Failed to initialize MCP: ${response.error.message}`);
    }
  }

  private async request(req: Omit<MCPRequest, 'id'>): Promise<MCPResponse> {
    const id = (++this.requestId).toString();
    const request: MCPRequest = { ...req, id };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // WebSocket接続の場合
      return new Promise((resolve) => {
        this.pendingRequests.set(id, resolve);
        this.ws!.send(JSON.stringify(request));
      });
    } else {
      // HTTP接続の場合
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      return response.json();
    }
  }

  async listTools(): Promise<MCPTool[]> {
    const response = await this.request({
      method: 'tools/list',
    });

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    return response.result.tools;
  }

  async callTool(name: string, args: any): Promise<any> {
    const response = await this.request({
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    });

    if (response.error) {
      throw new Error(`Failed to call tool ${name}: ${response.error.message}`);
    }

    return response.result.content[0].text;
  }

  async searchKnowledge(query: string, limit: number = 4): Promise<any> {
    const result = await this.callTool('search_knowledge', { query, limit });
    return JSON.parse(result);
  }

  async getConversationHistory(userId: string, limit: number = 10): Promise<any> {
    const result = await this.callTool('get_conversation_history', { userId, limit });
    return JSON.parse(result);
  }

  async analyzeSentiment(text: string): Promise<any> {
    const result = await this.callTool('analyze_sentiment', { text });
    return JSON.parse(result);
  }

  async webSearch(query: string, source: string = 'duckduckgo'): Promise<any> {
    const result = await this.callTool('web_search', { query, source });
    return JSON.parse(result);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
}

// MCPツールをLangChainのツールとして統合
export function createMCPTools(mcpClient: MCPClient) {
  return [
    {
      name: 'mcp_search',
      description: 'MCP経由でドキュメントを検索',
      func: async (input: { query: string; limit?: number }) => {
        const results = await mcpClient.searchKnowledge(input.query, input.limit);
        return JSON.stringify(results);
      },
    },
    {
      name: 'mcp_history',
      description: 'MCP経由で会話履歴を取得',
      func: async (input: { userId: string; limit?: number }) => {
        const results = await mcpClient.getConversationHistory(input.userId, input.limit);
        return JSON.stringify(results);
      },
    },
    {
      name: 'mcp_sentiment',
      description: 'MCP経由で感情分析を実行',
      func: async (input: { text: string }) => {
        const result = await mcpClient.analyzeSentiment(input.text);
        return JSON.stringify(result);
      },
    },
    {
      name: 'mcp_web_search',
      description: 'MCP経由でWeb検索を実行',
      func: async (input: { query: string; source?: string }) => {
        const result = await mcpClient.webSearch(input.query, input.source);
        return JSON.stringify(result);
      },
    },
  ];
}