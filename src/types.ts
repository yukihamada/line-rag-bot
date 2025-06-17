export interface Env {
  DB: D1Database;
  VECTORIZE_INDEX: any;
  AI: any;
  KV: KVNamespace;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_TOKEN: string;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  MCP_SERVER: DurableObjectNamespace;
  MCP_SERVER_URL?: string;
}

export interface LineEvent {
  type: string;
  message?: {
    type: string;
    text: string;
  };
  source: {
    userId: string;
    type: string;
  };
  replyToken: string;
  timestamp: number;
}

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MemoryRecord {
  user_id: string;
  ts: number;
  role: string;
  content: string;
}