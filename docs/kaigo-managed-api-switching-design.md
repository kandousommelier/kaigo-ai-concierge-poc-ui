# 介護現場AIコンシェルジュ 自社管理API差し替え設計メモ

## 結論

現行の介護現場AIコンシェルジュUIは残せます。

ただし、現在のAI呼び出し経路は Amazon Bedrock 前提です。将来、自社管理の介護現場AIコンシェルジュAPIへ差し替える場合は、画面全体を作り直すのではなく、主に以下の境界を整理するのが現実的です。

- フロントエンドの推論呼び出し入口: `packages/web/src/lib/chatApi.ts`
- チャット状態管理: `packages/web/src/hooks/useChat.ts`
- バックエンドProvider分岐: `packages/cdk/lambda/utils/api.ts`
- Bedrock実装本体: `packages/cdk/lambda/utils/bedrockApi.ts`
- Bedrock権限・環境変数: `packages/cdk/lib/construct/api.ts`

`AI_PROVIDER=bedrock` と `AI_PROVIDER=kaigo_api` を切り替えられる構成にする場合、まずは設計上の境界を作り、`kaigo_api` の正式API仕様が決まるまでは仮接続しない方針が安全です。

## 現行UIのAI呼び出し経路

### 1. 画面からの送信

ユーザーがチャット画面で送信すると、`packages/web/src/hooks/useChat.ts` の `post()` がユーザー発言と空のアシスタント発言を画面状態に追加します。

その後、`generateMessage()` が以下を行います。

1. `MODELS` から利用モデルを取得する
2. system prompt と会話履歴を組み立てる
3. 介護現場AIコンシェルジュの場合は system role に runtime guidance を追記する
4. `predictStream()` に `model`, `messages`, `id` を渡す
5. 返ってきたストリーミングチャンクを画面に追記する
6. `/chats` 系APIへ会話履歴を保存する

### 2. フロントエンドのAPI参照箇所

- `packages/web/src/lib/fetcher.ts`
  - `VITE_APP_API_ENDPOINT` を使って API Gateway 側の `/chats`, `/systemcontexts`, `/predict/title` などを呼び出します。

- `packages/web/src/lib/chatApi.ts`
  - `createChat()`, `createMessages()`, `updateTitle()` は `genUApi` 経由で API Gateway を呼び出します。
  - `predictStream()` は `VITE_APP_PREDICT_STREAM_FUNCTION_ARN` を使い、ブラウザから AWS Lambda の `InvokeWithResponseStream` を直接呼び出します。
  - この部分が、将来自社管理APIへ差し替える最大の境界です。

- `packages/web/src/models.ts`
  - `VITE_APP_MODEL_IDS` を読み、現在は `type: 'bedrock'` のモデル一覧として扱います。

### 3. バックエンド側のAI呼び出し

- `packages/cdk/lambda/predictStream.ts`
  - `resolveAllowedTextModel(event.model)` でモデルを検証します。
  - `api[model.type].invokeStream(...)` を呼びます。

- `packages/cdk/lambda/utils/api.ts`
  - 現在のProvider分岐は `bedrock` と `sagemaker` です。

- `packages/cdk/lambda/utils/bedrockApi.ts`
  - `BedrockRuntimeClient`
  - `ConverseCommand`
  - `ConverseStreamCommand`
  - `InvokeModelCommand`
  を使っています。

- `packages/cdk/lambda/predictTitle.ts`
  - タイトル生成は `api['bedrock'].invoke(...)` を直接呼んでおり、ここもBedrock依存です。

### 4. CDK側のBedrock依存

- `packages/cdk/lib/construct/api.ts`
  - `MODEL_REGION`, `MODEL_IDS`, `IMAGE_GENERATION_MODEL_IDS` を Lambda 環境変数へ渡しています。
  - Lambda に `bedrock:InvokeModel` と `bedrock:InvokeModelWithResponseStream` を付与しています。

- `packages/cdk/lib/construct/web.ts`
  - Webビルド時に `VITE_APP_MODEL_IDS`, `VITE_APP_PREDICT_STREAM_FUNCTION_ARN`, `VITE_APP_AI_PROVIDER` などを渡しています。

- `packages/cdk/env-parameters/self-hosting-kaigo-poc.ts`
  - 現在 `aiProvider: 'bedrock'` です。
  - ただし、現状では `VITE_APP_AI_PROVIDER` は送信先切り替えにはまだ使われていません。

## Bedrock依存箇所

主な依存箇所は以下です。

- `packages/web/src/lib/chatApi.ts`
  - AWS Lambda SDK と Cognito Identity Pool を使った `InvokeWithResponseStream`

- `packages/web/src/models.ts`
  - `VITE_APP_MODEL_IDS` をBedrockモデルとして扱う実装

- `packages/web/src/hooks/useChat.ts`
  - `modelId` を取得して `PredictRequest.model` に入れる処理
  - `llmType` に `model.modelId` を保持する処理

- `packages/types/src/message.d.ts`
  - `Model.type` が `bedrock | sagemaker` のみ

- `packages/cdk/lambda/predictStream.ts`
  - `api[model.type].invokeStream` によるBedrock/SageMaker前提のProvider選択

- `packages/cdk/lambda/utils/api.ts`
  - `bedrockApi` と `sagemakerApi` のみ登録

- `packages/cdk/lambda/utils/bedrockApi.ts`
  - Bedrock Runtime API 実装本体

- `packages/cdk/lambda/utils/models.ts`
  - Bedrockモデル定義、Bedrock用プロンプト変換

- `packages/cdk/lambda/utils/allowedModels.ts`
  - 許可モデル判定がBedrock/SageMaker前提

- `packages/cdk/lambda/predictTitle.ts`
  - `api['bedrock']` 直指定

- `packages/cdk/lib/construct/api.ts`
  - Bedrockモデル検証、Lambda環境変数、IAM権限

## kaigo_api化する場合の設計案

### 推奨方針

現行UIは残し、AI推論部分だけを段階的に抽象化します。

```text
AI_PROVIDER=bedrock
  現行の Lambda InvokeWithResponseStream + Bedrock ConverseStream

AI_PROVIDER=kaigo_api
  自社管理の介護現場AIコンシェルジュAPI
  サーバー側にSYSTEM_PROMPTを固定
  フロントにはプロンプト本文を返さない
```

### 段階1: フロントエンドのProvider境界

`packages/web/src/lib/chatApi.ts` に、次のような境界を作るのが第一候補です。

```ts
type ChatStreamProvider = 'bedrock' | 'kaigo_api';

type StreamChatRequest = {
  messages: UnrecordedMessage[];
  id: string;
  mode?: 'express' | 'standard';
};

type StreamChatChunk = {
  text: string;
  stopReason?: string;
  trace?: string;
  sessionId?: string;
};
```

`bedrock` の場合は既存の `InvokeWithResponseStream` をそのまま使います。

`kaigo_api` の場合は、将来 `VITE_APP_KAIGO_API_ENDPOINT` に対して `POST /api/chat` または `POST /api/chat/stream` を呼ぶ想定にします。

ただし、現時点ではAPI仕様が未確定なので、`kaigo_api` 実装は stub または TODO に留めます。

### 段階2: バックエンドProvider境界

CDK/Lambda側を残す場合は、以下のような構成にします。

```text
packages/cdk/lambda/providers/
  index.ts
  bedrockProvider.ts
  kaigoApiProvider.ts
```

Provider interface は以下のような最小形にします。

```ts
type AiProvider = {
  invoke?: (request: ProviderRequest) => Promise<string>;
  invokeStream?: (request: ProviderRequest) => AsyncGenerator<string>;
};
```

`bedrockProvider` は既存 `bedrockApi.ts` を移すだけに近い形にし、既存挙動を壊さないようにします。

`kaigoApiProvider` は、源内AI OSS の `genai-ai-api` の考え方を参考にした自社管理APIへHTTPS接続する実装にします。ただし、正式API仕様、認証方式、ログ保存方針が決まるまで実装しません。

### 段階3: CDKの権限分離

`AI_PROVIDER=kaigo_api` の場合は、以下を分けます。

- Bedrock IAM権限を付与しない
- `MODEL_IDS` を必須にしない
- `KAIGO_API_ENDPOINT` を環境変数で渡す
- APIキーやOAuthクライアントシークレットは Secrets Manager で管理する
- Web画面にはプロンプト本文や秘密情報を渡さない

## 自社管理APIに求める仕様

### エンドポイント

候補:

- `POST /api/chat`
- `POST /api/chat/stream`

ストリーミングを優先する場合は `POST /api/chat/stream` を使い、UI側では既存の `StreamingChunk` に近い形へ変換すると影響を小さくできます。

### 入力

フロントから送る情報は、原則として以下に絞ります。

```json
{
  "conversationId": "optional",
  "mode": "standard",
  "messages": [
    { "role": "user", "content": "利用者が入力した質問" },
    { "role": "assistant", "content": "必要な範囲の過去回答" }
  ],
  "usecase": "kaigo-concierge",
  "clientRequestId": "uuid"
}
```

重要:

- フロントから本番SYSTEM_PROMPTを送らない
- フロントへSYSTEM_PROMPTを返さない
- 利用者がSYSTEM_PROMPTを閲覧・編集できない
- `modelId` や `llmType` を利用者画面に出さない

### サーバー側の責務

自社管理API側で以下を担います。

- 介護現場AIコンシェルジュ用 `SYSTEM_PROMPT` を固定
- 必要に応じてカテゴリ別補助指示をサーバー側で付与
- OpenAI GPT / Azure OpenAI / Gemini などの接続先をサーバー側設定で切り替え
- 会話ログ保存の有無を環境変数で制御
- APIキーや認証情報を Secrets Manager 等で管理
- 個人情報入力禁止や用途制限はUI側にも表示し、サーバー側でも必要に応じて検査する

### 出力

非ストリーミング:

```json
{
  "message": "AI回答本文",
  "stopReason": "end_turn"
}
```

ストリーミング:

- SSE: `text/event-stream`
- NDJSON: 1行ごとに `{ "text": "..." }`
