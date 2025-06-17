# LINE RAG Bot with Cloudflare

Cloudflare Workers + Vectorize + D1 + Workers AIを使用した、検索機能と会話履歴を持つLINE Botです。

## 機能

- 🔍 **RAG（Retrieval-Augmented Generation）**: Vectorizeを使用した高精度な情報検索
- 💬 **会話履歴管理**: D1データベースによる永続的な会話記録
- 🤖 **LLM推論**: Workers AI（Llama 3 70B）による自然な応答生成
- ⚡ **高速レスポンス**: Cloudflare Edgeでの処理による低遅延
- 🔐 **セキュアな通信**: LINE署名検証による安全な通信

## アーキテクチャ

```
LINE ↔ Cloudflare Worker (Edge) ─┬─ LangChain JS (RAG Chain)
                                  │
                                  ├─ Workers AI  (embedding + chat LLM)
                                  │
                                  ├─ Vectorize   (semantic search index)
                                  │
                                  └─ D1 / KV     (per-user conversation store)
```

## セットアップ

### 1. 前提条件

- Node.js 18以上
- Cloudflareアカウント
- LINE Developersアカウント

### 2. インストール

```bash
git clone <repository-url>
cd line-rag-bot
npm install
```

### 3. Cloudflareリソースの作成

```bash
# D1データベース作成
wrangler d1 create bot_db

# Vectorizeインデックス作成
wrangler vectorize create kb_index

# KVネームスペース作成（オプション）
wrangler kv:namespace create "cache"
```

### 4. 環境変数の設定

`.env.example`を`.env`にコピーして編集：

```bash
cp .env.example .env
```

シークレットの設定：

```bash
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put LINE_CHANNEL_TOKEN
wrangler secret put CF_API_TOKEN
```

### 5. データベースマイグレーション

```bash
wrangler d1 execute bot_db --file=./migrations/0001_create_memory_table.sql
```

### 6. ドキュメントのアップロード

```bash
# documentsフォルダにテキストファイルを配置
mkdir documents
# .txt, .mdファイルを追加

# Vectorizeにアップロード
npm run upload-docs ./documents
```

### 7. デプロイ

```bash
wrangler deploy
```

### 8. LINE Webhook設定

LINE Developers ConsoleでWebhook URLを設定：
```
https://your-worker-name.your-subdomain.workers.dev/webhook
```

## 使い方

1. LINE公式アカウントを友だち追加
2. メッセージを送信すると、登録されたドキュメントから関連情報を検索して回答
3. 会話履歴は自動的に保存され、文脈を考慮した応答が可能

## 開発

### ローカル開発

```bash
wrangler dev
```

### TypeScript設定

```bash
npm run typecheck
```

### ログ確認

```bash
wrangler tail
```

## コスト目安

| サービス | 無料枠 | 超過時の料金 |
|---------|-------|-------------|
| Workers AI | 100k tokens/月 | $0.50/1M tokens |
| Vectorize | 1GB / 100kベクトル | $0.20/GB |
| D1 | 100k rows/月 | 従量課金 |
| Workers | 100k requests/日 | $0.50/1M requests |

## トラブルシューティング

### LINE署名検証エラー
- Channel Secretが正しく設定されているか確認
- Webhook URLがHTTPSであることを確認

### Vectorize検索エラー
- インデックスが作成されているか確認
- ドキュメントがアップロードされているか確認

### D1接続エラー
- Database IDが正しく設定されているか確認
- マイグレーションが実行されているか確認

## ライセンス

MIT License