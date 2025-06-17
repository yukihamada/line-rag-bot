# 管理画面使用ガイド

## 概要

LINE RAG Botの管理画面は、Botの運用状況を監視し、設定を管理するためのWebベースの管理インターフェースです。

## アクセス方法

管理画面には以下のURLからアクセスできます：
```
https://your-worker-name.your-subdomain.workers.dev/admin
```

## セットアップ

### 1. 管理パスワードの設定

```bash
wrangler secret put ADMIN_KEY
# 管理用パスワードを入力
```

### 2. 必要な権限

管理画面を使用するには、以下のCloudflareサービスへのアクセス権限が必要です：
- D1 Database（読み取り・書き込み）
- KV Storage（セッション管理）
- Workers AI（統計取得）
- Vectorize（ドキュメント管理）

## 機能一覧

### 📊 ダッシュボード

**主要統計**
- 総ユーザー数
- 総メッセージ数
- 登録ドキュメント数
- 今日のアクティブユーザー数

**可視化**
- 週別メッセージ・ユーザー統計（Chart.js使用）
- 人気トピック一覧

**データソース**
```sql
-- 基本統計クエリ例
SELECT COUNT(DISTINCT user_id) as total_users FROM memory;
SELECT COUNT(*) as total_messages FROM memory;
SELECT COUNT(*) as total_docs FROM documents WHERE vector_indexed = TRUE;
```

### 📄 ドキュメント管理

**機能**
- ドキュメント一覧表示（ページネーション対応）
- ドキュメント詳細表示
- ドキュメント削除
- 検索機能
- ベクトル化ステータス確認

**操作手順**
1. ドキュメント一覧でファイルを確認
2. 「表示」ボタンで詳細を確認
3. 「削除」ボタンで不要なドキュメントを削除
4. 検索バーでドキュメントを絞り込み

**注意事項**
- 削除されたドキュメントは復元できません
- ベクトル化未完了のドキュメントは検索対象外です

### 👥 ユーザー管理

**表示情報**
- ユーザーID
- メッセージ数
- 最終アクティビティ
- 初回利用日

**操作**
- 「会話履歴」ボタンで個別ユーザーの会話ログを表示
- ユーザー行動分析

**プライバシー配慮**
- ユーザーIDは匿名化されています
- 個人情報は表示されません

### 🔌 MCP管理

**監視項目**
- 利用可能ツール数
- リソース数
- プロンプト数
- アクティブ接続数

**ツール一覧**
- `search_knowledge`: ドキュメント検索
- `get_conversation_history`: 会話履歴取得
- `analyze_sentiment`: 感情分析
- `web_search`: Web検索

**パフォーマンス**
- WebSocket接続状況
- ツール実行統計
- エラー率

### ⚙️ 設定管理

**LLM設定**
- モデル名（読み取り専用）
- 温度設定（0.0 - 1.0）
- 最大トークン数（512 - 4096）

**RAG設定**
- ベクトル検索件数（1 - 20）
- 会話履歴保持件数（5 - 50）

**設定変更手順**
1. 設定画面で値を変更
2. 「設定を保存」ボタンをクリック
3. 設定はKVストレージに保存されます

### 📋 ログ・監視

**ログレベル**
- ERROR: エラー発生時
- WARN: 警告事項
- INFO: 一般的な情報

**主要ログ**
```
[INFO] Bot started successfully
[INFO] User message processed: userId=U123456
[INFO] Document search executed: query="example"
[WARN] Rate limit approaching for user U123456
[ERROR] Failed to process message: error details
```

**監視ポイント**
- エラー率の増加
- レスポンス時間の劣化
- リソース使用量

## セキュリティ

### 認証システム

**セッション管理**
- Cookie ベースのセッション
- 24時間の有効期限
- HTTPOnly, Secure, SameSite 属性

**アクセス制御**
```typescript
// 各APIエンドポイントで認証チェック
const authError = await requireSessionAuth(c);
if (authError) return authError;
```

### セキュリティ設定

**推奨事項**
- 強力な管理パスワードの設定
- 定期的なパスワード変更
- アクセスログの監視
- HTTPS通信の徹底

## APIエンドポイント

### 認証
```
POST /admin/login
POST /admin/logout
```

### データ取得
```
GET /admin/api/dashboard          # ダッシュボード統計
GET /admin/api/documents          # ドキュメント一覧
GET /admin/api/documents/:id      # ドキュメント詳細
GET /admin/api/users              # ユーザー一覧
GET /admin/api/users/:id/conversations  # 会話履歴
GET /admin/api/mcp/stats          # MCP統計
GET /admin/api/settings           # システム設定
```

### データ操作
```
DELETE /admin/api/documents/:id   # ドキュメント削除
POST /admin/api/settings          # 設定更新
```

## トラブルシューティング

### ログインできない
1. 管理パスワード（ADMIN_KEY）が正しく設定されているか確認
2. Cookieが有効になっているか確認
3. HTTPSでアクセスしているか確認

### データが表示されない
1. D1データベースにデータが存在するか確認
2. マイグレーションが正しく実行されているか確認
3. ブラウザのコンソールでJavaScriptエラーを確認

### パフォーマンス問題
1. データベースのインデックスを確認
2. ページネーション設定を調整
3. リクエスト頻度を制限

### セキュリティ警告
1. 管理パスワードを変更
2. セッションをクリア
3. アクセスログを確認

## メンテナンス

### 定期作業

**日次**
- エラーログの確認
- アクティブユーザー数の確認
- システムパフォーマンスの確認

**週次**
- ドキュメント統計の確認
- ユーザー行動分析
- ストレージ使用量の確認

**月次**
- セキュリティログの確認
- パフォーマンス傾向の分析
- システム設定の見直し

### バックアップ

**重要データ**
- D1データベース（会話履歴・ドキュメント）
- KVストレージ（設定・セッション）
- システム設定

**バックアップ手順**
```bash
# D1のバックアップ
wrangler d1 export bot_db --output=backup.sql

# 設定のエクスポート
wrangler kv:bulk get --namespace-id=YOUR_KV_ID
```

## 技術仕様

### フロントエンド
- Vanilla JavaScript（依存関係最小化）
- Chart.js（統計可視化）
- レスポンシブデザイン
- PWA対応

### バックエンド
- Hono Framework
- Cloudflare Workers
- TypeScript

### データストレージ
- D1（メインデータ）
- KV（セッション・設定）
- Vectorize（ドキュメント検索）

## カスタマイズ

### テーマ変更
CSS変数を修正してカラーテーマを変更可能：
```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
}
```

### 追加機能
新しい管理機能を追加する場合：
1. APIエンドポイントを追加
2. フロントエンドに対応する画面を追加
3. 認証チェックを実装

## サポート

問題が発生した場合は、以下を確認してください：
1. Cloudflare Workers のログ
2. ブラウザの開発者ツール
3. D1データベースの状態
4. 環境変数の設定

GitHubのIssueでサポートを受けることも可能です。