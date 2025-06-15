# Integration Test Platform

TypeScriptで実装されたYAMLベースのテストワークフロー実行エンジンです。

## 概要

このプラットフォームは以下の機能を提供します：

- YAMLで記述されたテストケースの実行
- 拡張可能なアクションシステム
- ステップ間での出力データ共有
- 設定管理とテンプレート変数機能
- Allureレポート生成
- Dockerでのレポート表示

## アーキテクチャ

### コアコンポーネント

#### TestEngine
- YAMLテストケースの解析と実行
- アクションの管理と実行
- 変数置換とコンテキスト管理

#### Actions
- `BaseAction`: 統一インターフェースを持つ抽象クラス
- `EchoAction`: 入力をそのまま出力として返すアクション
- `NopAction`: 常に成功するアクション  
- `FailAction`: 常に失敗するアクション

#### Reporters
- `BaseReporter`: レポーティングの抽象クラス
- `AllureReporter`: Allureレポート生成機能

#### Config
- YAML設定ファイルの読み込み
- 環境変数による設定オーバーライド
- `Config.get("key.subKey")` インターフェース

## セットアップ

### 依存関係のインストール

```bash
npm install
```

### TypeScriptコンパイル

```bash
npm run build
```

## 使用方法

### テスト実行

```bash
# 全てのテストファイルを実行（デフォルト: test-cases/）
npm test

# 特定のファイルを実行
npm test test-cases/echo-sample.yaml

# 複数のファイルを実行
npm test test-cases/echo-sample.yaml test-cases/failure-sample.yaml

# 特定のディレクトリ内の全てのテストを実行
npm test test-cases/

# 複数のディレクトリやファイルを組み合わせて実行
npm test test-cases/echo-sample.yaml test-cases/subfolder/
```

### 設定ファイル

`config.yaml` でベース設定を定義：

```yaml
baseUrl: "http://localhost:8080"
database:
  host: "localhost"
  port: 5432
  name: "testdb"
api:
  timeout: 30000
  retries: 3
```

### 環境変数での設定オーバーライド

```bash
DATABASE_HOST=test-db npm test
```

## テストケースの書き方

### 基本構造

```yaml
kind: TestCase
version: "1.1"
name: Sample Test Case
step:
  - name: Initialize test data
    id: init_data
    kind: Echo
    params:
      message: "Test initialization"
      data:
        users:
          - name: "Taro Yamada"
            email: "yamada@example.com"
```

### 変数置換

- `{testCaseId}`: テストケースの一意ID
- `{testCaseName}`: テストケース名
- `{stepId.response.field}`: 前のステップの出力参照
- `{stepId.response.data.users[0].name}`: 配列要素への参照

### 利用可能なアクション

#### Echo
入力パラメータをそのまま出力として返します。

```yaml
- name: Echo test
  kind: Echo
  params:
    message: "Hello World"
    data: { key: "value" }
```

#### Nop
常に成功するアクション。ステータス確認に使用。

```yaml
- name: Success operation
  kind: Nop
```

#### Fail
常に失敗するアクション。エラーハンドリングテストに使用。

```yaml
- name: Failure test
  kind: Fail
  params:
    message: "Intentional failure"
```

## Allureレポート

### レポート生成

テスト実行後、`./allure-results` ディレクトリにJSON形式の結果が出力されます。

### レポート表示

Dockerを使用してAllureレポートサーバーを起動：

```bash
# Dockerイメージビルド
docker build -t allure-serve ./allure

# レポートサーバー起動
docker run -p 8080:8080 -v $(pwd)/allure-results:/app/allure-results allure-serve
```

http://localhost:8080 でレポートが確認できます。

## ディレクトリ構造

```
src/
├── actions/           # アクション実装
│   ├── BaseAction.ts
│   ├── EchoAction.ts
│   ├── NopAction.ts
│   └── FailAction.ts
├── reporters/         # レポーター実装
│   ├── BaseReporter.ts
│   └── AllureReporter.ts
├── Config.ts          # 設定管理
├── TestEngine.ts      # メインエンジン
└── test-runner.ts     # テスト実行スクリプト

test-cases/            # テストケース
├── echo-sample.yaml
└── failure-sample.yaml

allure/                # Allureサーバー
├── Dockerfile
└── entrypoint.sh

config.yaml            # 設定ファイル
allure-results/        # テスト結果
```

## 拡張方法

### カスタムアクション追加

1. `BaseAction` を継承したクラスを作成
2. `execute` メソッドを実装
3. `TestEngine` にアクションを登録

```typescript
export class CustomAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    // カスタムロジック
    return {
      success: true,
      output: { status: 'OK' }
    };
  }
}

// 登録
engine.registerAction('Custom', new CustomAction());
```

### カスタムレポーター追加

1. `BaseReporter` を継承したクラスを作成
2. 必要なメソッドを実装

```typescript
export class CustomReporter extends BaseReporter {
  public async reportTestStart(testCaseId: string, testCaseName: string): Promise<void> {
    // カスタムレポート処理
  }
  // 他のメソッドも実装
}
```

## 技術スタック

- **TypeScript**: メイン開発言語
- **yamljs**: YAML解析
- **allure-js-commons**: テストレポート生成
- **uuid**: 一意ID生成
- **Docker**: レポートサーバー

## ライセンス

ISC