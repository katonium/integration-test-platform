# YAML Test Engine

TypeScriptで作成されたYAMLベースのテストエンジンです。PostgreSQLクエリとREST API呼び出しをサポートし、レスポンスアサーションによる検証が可能です。

## 特徴

- **YAML設定**: テストケースをYAMLで記述
- **PostgreSQL対応**: SQLクエリの実行とアサーション
- **REST API対応**: HTTP リクエストの実行とレスポンス検証
- **テンプレート変数**: `{baseUrl}`, `{testCaseId}` などの動的値
- **ステップ間のデータ共有**: 前のステップの結果を後のステップで利用
- **包括的なアサーション**: 値の比較、null チェック、特殊条件など
- **Docker対応**: コンテナ環境での実行

## インストール

### ローカル実行

```bash
npm install
npm run build
```

### Docker使用

```bash
docker-compose up -d postgres
docker-compose build yaml-test-engine
```

## 使用方法

### コマンドライン

#### テスト実行

```bash
# ローカル実行
npm run dev run tests/sample.yaml \
  --pg-host localhost \
  --pg-database testdb \
  --pg-user testuser \
  --pg-password testpass \
  --base-url http://localhost:3000 \
  --test-case-id sample-test-001

# ビルド済みの場合
npm start run tests/sample.yaml [オプション]
```

#### テストファイル検証

```bash
npm run dev validate tests/sample.yaml
```

### Docker実行

```bash
# PostgreSQLコンテナを起動
docker-compose up -d postgres

# テストを実行
docker run --rm \
  --network yaml-test-engine_default \
  -v $(pwd)/tests:/app/tests \
  -v $(pwd)/sql:/app/sql \
  yaml-test-engine_yaml-test-engine \
  run /app/tests/sample.yaml \
  --pg-host postgres \
  --pg-database testdb \
  --pg-user testuser \
  --pg-password testpass \
  --base-url http://host.docker.internal:3000 \
  --test-case-id sample-test-001
```

## テストケースの書き方

### 基本構造

```yaml
kind: TestCase
version: "1.1"
name: テストケース名
step:
  - name: ステップ名
    id: step-id  # オプション、他のステップから参照する場合
    kind: PostgreSQL | RESTApiExecution
    params: # ステップ固有のパラメータ
    responseAssertion: # レスポンス検証（オプション）
```

### PostgreSQL ステップ

```yaml
- name: データ挿入
  id: insert-step
  kind: PostgreSQL
  params:
    query: "INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');"
    # または
    fromFile: path/to/query.sql
  responseAssertion:
    count: 1  # 影響を受けた行数
```

### REST API ステップ

```yaml
- name: API呼び出し
  id: api-call
  kind: RESTApiExecution
  params:
    request:
      url: "{baseUrl}/api/users"
      method: POST
      headers:
        - content-type: application/json
        - authorization: Bearer {token}
      body:
        name: Test User
        email: test@example.com
    responseAssertion:
      status: 201
      headers:
        - content-type: [shouldNotBeNull]
      body:
        id: [shouldNotBeNull]
        name: Test User
```

## アサーション

### 基本的な値の比較

```yaml
responseAssertion:
  field1: expected_value
  field2: 
    nested: value
```

### 特殊アサーション

```yaml
responseAssertion:
  field1: [shouldNotBeNull]    # null でないことを確認
  field2: [shouldBeNull]       # null であることを確認
  field3: [shouldBeEmpty]      # 空であることを確認
  field4: [shouldNotBeEmpty]   # 空でないことを確認
```

### ステップ間のデータ参照

```yaml
responseAssertion:
  user_id: [api_step.response.data.id]  # 他のステップの結果を参照
  status_code: [api_step.response.status]
```

### テンプレート変数

以下の変数がサポートされています：

- `{baseUrl}` - `--base-url` で指定されたベースURL
- `{testCaseId}` - `--test-case-id` で指定されたテストケースID
- `{step_id.response.field}` - 他のステップの結果

## コマンドラインオプション

### `run` コマンド

- `--pg-host <host>` - PostgreSQLホスト (デフォルト: localhost)
- `--pg-port <port>` - PostgreSQLポート (デフォルト: 5432)
- `--pg-database <database>` - データベース名
- `--pg-user <user>` - ユーザー名
- `--pg-password <password>` - パスワード
- `--base-url <url>` - REST API のベースURL
- `--test-case-id <id>` - テストケースID

### `validate` コマンド

YAMLファイルの構文と基本的な構造を検証します。

## ディレクトリ構造

```
yaml-test-engine/
├── src/
│   ├── types.ts              # 型定義
│   ├── assertionEngine.ts    # アサーションエンジン
│   ├── testEngine.ts         # メインテストエンジン
│   ├── executors/
│   │   ├── postgresqlExecutor.ts
│   │   └── restApiExecutor.ts
│   └── index.ts              # エントリーポイント
├── tests/
│   └── sample.yaml           # サンプルテストケース
├── sql/
│   ├── 01-init.sql          # データベース初期化
│   └── prep2.sql            # サンプルSQLファイル
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 開発

### 依存関係のインストール

```bash
npm install
```

### 開発モード

```bash
npm run dev run tests/sample.yaml [オプション]
```

### ビルド

```bash
npm run build
```

### Docker開発環境

```bash
# PostgreSQLを起動
docker-compose up -d postgres

# アプリケーションをビルド
docker-compose build yaml-test-engine

# テストを実行
docker-compose run --rm yaml-test-engine run /app/tests/sample.yaml \
  --pg-host postgres \
  --pg-database testdb \
  --pg-user testuser \
  --pg-password testpass
```

## トラブルシューティング

### PostgreSQL接続エラー

1. PostgreSQLが起動していることを確認
2. 接続情報（ホスト、ポート、データベース名、認証情報）が正しいことを確認
3. ファイアウォールやネットワーク設定を確認

### REST API呼び出しエラー

1. ベースURLが正しいことを確認
2. APIサーバーが起動していることを確認
3. ネットワーク接続を確認

### YAML構文エラー

1. `validate` コマンドでYAMLファイルを検証
2. インデントがスペースで統一されていることを確認
3. 必須フィールドが設定されていることを確認

## ライセンス

MIT License