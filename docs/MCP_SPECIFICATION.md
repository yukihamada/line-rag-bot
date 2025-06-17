# MCP (Model Context Protocol) 仕様書

## 概要

Model Context Protocol (MCP) は、AIアシスタントと外部システムを接続するためのオープンスタンダードプロトコルです。LINE RAG Botでは、MCPサーバーを実装し、様々なツールやリソースを提供します。

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   LINE Users    │────▶│  LINE RAG Bot    │────▶│   MCP Server    │
└─────────────────┘     │  (MCP Client)    │     │ (Durable Object)│
                        └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   LangChain      │     │   Tools & APIs  │
                        │   RAG Pipeline   │     │  - Vectorize    │
                        └──────────────────┘     │  - Workers AI   │
                                                  │  - D1 Database  │
                                                  └─────────────────┘
```

## 実装詳細

### 1. MCP Server (Durable Object)

Cloudflare Durable Objectsを使用して、永続的なWebSocket接続を管理します。

**エンドポイント:**
- WebSocket: `wss://your-worker.workers.dev/mcp`
- HTTP: `https://your-worker.workers.dev/mcp`
- SSE: `https://your-worker.workers.dev/mcp/sse`

**主な機能:**
- プロトコルバージョン: `2024-11-05`
- WebSocket/HTTP/SSEによる通信サポート
- ツール、リソース、プロンプトの動的管理

### 2. 実装されたツール

#### search_knowledge
Vectorize内のドキュメントから関連情報を検索します。

```json
{
  "name": "search_knowledge",
  "description": "Vectorize内のドキュメントから関連情報を検索",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "検索クエリ"
      },
      "limit": {
        "type": "number",
        "description": "検索結果の最大数",
        "default": 4
      }
    },
    "required": ["query"]
  }
}
```

#### get_conversation_history
ユーザーの会話履歴をD1データベースから取得します。

```json
{
  "name": "get_conversation_history",
  "description": "ユーザーの会話履歴を取得",
  "inputSchema": {
    "type": "object",
    "properties": {
      "userId": {
        "type": "string",
        "description": "ユーザーID"
      },
      "limit": {
        "type": "number",
        "description": "取得する履歴の最大数",
        "default": 10
      }
    },
    "required": ["userId"]
  }
}
```

#### analyze_sentiment
Workers AIを使用してテキストの感情分析を実行します。

```json
{
  "name": "analyze_sentiment",
  "description": "テキストの感情分析を実行",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "分析するテキスト"
      }
    },
    "required": ["text"]
  }
}
```

#### web_search
外部のWeb情報を検索します（DuckDuckGo API使用）。

```json
{
  "name": "web_search",
  "description": "外部のWeb情報を検索",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "検索クエリ"
      },
      "source": {
        "type": "string",
        "enum": ["google", "bing", "duckduckgo"],
        "default": "duckduckgo"
      }
    },
    "required": ["query"]
  }
}
```

### 3. リソース

MCPサーバーは以下のリソースを提供します：

- `rag://documents` - Vectorizeに登録されているドキュメント一覧
- `rag://conversations` - 全ユーザーの会話履歴統計
- `rag://settings` - Botの設定情報

### 4. プロンプト

事前定義されたプロンプトテンプレート：

- `answer_with_context` - コンテキストを考慮した回答生成
- `summarize_conversation` - 会話履歴の要約生成

## 使用方法

### LINE BotでのMCP有効化

環境変数 `MCP_SERVER_URL` を設定することで、MCPを有効化できます：

```bash
wrangler secret put MCP_SERVER_URL
# https://your-worker.workers.dev/mcp を入力
```

### MCP Clientの使用例

```typescript
import { MCPClient } from './mcp/client';

// クライアント初期化
const mcpClient = new MCPClient('https://your-worker.workers.dev/mcp');
await mcpClient.connectHTTP();

// ツール一覧取得
const tools = await mcpClient.listTools();

// 知識検索
const results = await mcpClient.searchKnowledge('Cloudflareの使い方', 5);

// 感情分析
const sentiment = await mcpClient.analyzeSentiment('とても嬉しいです！');

// クリーンアップ
mcpClient.disconnect();
```

### WebSocket接続

```javascript
const ws = new WebSocket('wss://your-worker.workers.dev/mcp');

ws.onopen = () => {
  // 初期化
  ws.send(JSON.stringify({
    id: '1',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: {
        name: 'my-client',
        version: '1.0.0'
      }
    }
  }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('MCP Response:', response);
};
```

## セキュリティ

1. **認証**: 現在の実装では基本的な認証は含まれていません。本番環境では、適切な認証メカニズムを追加してください。

2. **レート制限**: Cloudflare Workersの標準的なレート制限が適用されます。

3. **データプライバシー**: すべてのデータはCloudflareのインフラ内で処理され、外部に送信されません。

## 拡張性

MCPサーバーは以下の方法で拡張可能です：

1. **新しいツールの追加**: `handleToolsList` と `handleToolCall` メソッドに新しいツールを追加
2. **カスタムリソース**: `handleResourcesList` と `handleResourceRead` でカスタムリソースを定義
3. **イベントストリーム**: SSEエンドポイントを使用してリアルタイムイベントを配信

## パフォーマンス

- **WebSocket**: 低遅延な双方向通信（推奨）
- **HTTP**: ステートレスなリクエスト/レスポンス
- **SSE**: サーバーからのプッシュ通知

## トラブルシューティング

### WebSocket接続エラー
- Durable Objectsが正しく設定されているか確認
- `wrangler.toml` の設定を確認

### ツール実行エラー
- 必要な環境変数（AI、DB、VECTORIZE_INDEX）が設定されているか確認
- ツールの入力パラメータが正しいか確認

### パフォーマンス問題
- Durable Objectのメモリ使用量を監視
- 大量の同時接続がある場合は、複数のDurable Objectインスタンスを使用

## 今後の拡張予定

1. **認証メカニズム**: JWT/APIキーベースの認証
2. **バッチ処理**: 複数ツールの並列実行
3. **ストリーミング応答**: 大きな結果のストリーミング配信
4. **カスタムツールプラグイン**: ユーザー定義ツールのサポート