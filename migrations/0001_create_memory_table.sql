-- 会話履歴を保存するテーブル
DROP TABLE IF EXISTS memory;
CREATE TABLE memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id_ts (user_id, ts DESC)
);

-- ドキュメント管理テーブル（Vectorizeと連携）
DROP TABLE IF EXISTS documents;
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT UNIQUE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT, -- JSON形式でメタデータを保存
  vector_indexed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ユーザー設定テーブル
DROP TABLE IF EXISTS user_preferences;
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  language TEXT DEFAULT 'ja',
  context_window INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);