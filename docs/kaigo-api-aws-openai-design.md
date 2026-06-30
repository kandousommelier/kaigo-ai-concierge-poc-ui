# 介護現場AIコンシェルジュ kaigo_api 設計メモ

## 方針

施設向け本番では Amazon Bedrock を使わず、AWS上に自社管理の `kaigo_api` を置き、そこから OpenAI GPT を呼び出す構成にする。

今回の段階では、OpenAI API への実接続、本番デプロイ、CDK変更、Bedrock権限削除は行わない。現行UIを残し、将来 `VITE_APP_AI_PROVIDER=kaigo_api` へ切り替えられる入口だけを準備する。

## 想定アーキテクチャ

```text
施設職員ブラウザ
  |
  | Cognitoログイン
  v
CloudFront / genai-web UI
  |
  | VITE_APP_AI_PROVIDER=kaigo_api
  | POST /api/chat または /api/chat/stream
  v
API Gateway
  |
  | Cognito Authorizer
  v
Lambda: kaigo_api
  |
  | SYSTEM_PROMPTをLambda側で固定
  | 会話ログは保存しない
  | 本文をCloudWatchへ出さない
  | OpenAI APIキーはSecrets Manager等から取得
  v
OpenAI GPT
```

## 認証

現行Cognitoを使う。施設職員はこれまで通りCognitoでログインし、`kaigo_api` 側はCognito Authorizerまたは検証済みJWTで認可する。

OpenAI APIキーはフロントエンドへ渡さない。Lambda側でSecrets Manager等から取得する。

## SYSTEM_PROMPT管理

介護現場AIコンシェルジュ用の `SYSTEM_PROMPT` はLambda側で固定する。

- フロントから本番プロンプトを送らない
- フロントへ本番プロンプトを返さない
- 利用者がプロンプトを閲覧・編集できない
- 源内AI会員版に本番プロンプトを保存しない

## 会話ログ保存なし方針

本番の `kaigo_api` では会話ログを保存しない。

現行UIでは、送信後に `/chats` と `/chats/{chatId}/messages` へ保存しているため、将来以下の整理が必要。

- セッション内の画面表示だけで会話を保持する
- ブラウザ更新後の会話復元はできない前提にする
- サイドバーのチャット履歴を非表示または無効化する
- `createChat()`, `createMessages()`, `predictTitle()` を呼ばないモードを用意する
- `listChats()`, `findChatById()`, `listMessages()` を使う画面導線を整理する

## CloudWatchログ方針

Lambdaでは質問本文、回答本文、会話履歴、個人情報に該当し得る内容をCloudWatchへ出さない。

ログに出してよいものは、以下のような運用情報に限定する。

- requestId
- userIdのハッシュまたは匿名ID
- status
- latency
- token概算
- error種別

## 想定API仕様

### エンドポイント

- `POST /api/chat`
- `POST /api/chat/stream`

ストリーミングを使う場合は `POST /api/chat/stream` を優先する。

### 入力

```json
{
  "mode": "standard",
  "messages": [
    { "role": "user", "content": "利用者の質問" },
    { "role": "assistant", "content": "必要な範囲の直近回答" }
  ],
  "usecase": "kaigo-concierge",
  "clientRequestId": "uuid"
}
```

注意:

- `system` role はフロントから送らない方針に寄せる
- 必要な場合でも、本番SYSTEM_PROMPT本文はLambda側で上書きする
- `modelId` や `llmType` は利用者向け画面に出さない

### 出力

非ストリーミング:

```json
{
  "message": "回答本文",
  "stopReason": "end_turn"
}
```

ストリーミング:

- SSE: `text/event-stream`
- NDJSON: 1行ごとに `{ "text": "..." }`

現行UIとの互換性を優先する場合は、既存 `StreamingChunk` に近いNDJSON形式が扱いやすい。

## Bedrock切り離し

施設向け本番ではBedrockを使わない。段階的に以下を進める。

1. `VITE_APP_AI_PROVIDER=kaigo_api` のstubを追加する
2. `kaigo_api` の正式API仕様を確定する
3. フロントの `predictStream()` をProvider分岐する
4. `/chats` 保存を無効化するモードを追加する
5. CDKで `kaigo_api` 用API Gateway + Lambda + Secrets Manager参照を追加する
6. `kaigo_api` 本番ではBedrock権限を付けない

今回のパッチでは1のみ行う。

## /chats 保存停止の影響

現在の保存箇所:

- `packages/web/src/hooks/useChat.ts`
  - `createChatIfNotExist()`
  - `addMessageIdsToUnrecordedMessages()`
  - `createMessages(chatId, { messages })`
  - `setPredictedTitle()`

- `packages/web/src/lib/chatApi.ts`
  - `createChat()`
  - `createMessages()`
  - `updateTitle()`
  - `predictTitle()`

- `packages/web/src/hooks/useChatApi.ts`
  - `listChats()`
  - `findChatById()`
  - `listMessages()`

- `packages/web/src/hooks/useChatList.ts`
  - 履歴一覧、削除、タイトル更新

- `packages/web/src/features/chat-history/components/*`
  - サイドバー履歴表示

保存を止める場合の影響:

- チャット履歴サイドバーは空または非表示にする
- 過去チャットURLからの復元はできなくなる
- タイトル自動生成は不要になる
- 送信中の画面表示はZustandのメモリ状態で維持できる
- ブラウザ更新・タブを閉じると会話は消える

## すぐ実装できる範囲

- `VITE_APP_AI_PROVIDER=kaigo_api` を読んで未実装エラーにする
- `VITE_APP_KAIGO_API_ENDPOINT` の型定義を追加する
- 設計メモをdocsに追加する

## 今回は実装しない範囲

- OpenAI APIキー設定
- OpenAI API実接続
- AWS/CDKデプロイ
- Bedrock権限削除
- `/chats` 保存無効化の本実装
- 源内AI会員版接続
- 施設配布再開

## 施設配布再開までの残課題

1. `kaigo_api` のAPI仕様確定
2. OpenAI APIキーのSecrets Manager管理
3. Lambda側のSYSTEM_PROMPT固定
4. CloudWatchへ本文を出さない実装
5. 会話ログ保存なしモードの実装
6. サイドバー履歴・復元導線の整理
7. Cognito Authorizerの確認
8. Rate limit、監視、予算アラート
9. 障害時メッセージ
10. 本番停止フラグ解除手順
