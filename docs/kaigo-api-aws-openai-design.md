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

施設配布前に、Web側で `VITE_APP_CHAT_HISTORY_MODE=disabled` を有効化する。

このモードでは、以下の扱いにする。

- セッション内の画面表示だけで会話を保持する
- ブラウザ更新、タブを閉じる、再ログインで会話は消える
- `/chats` 系APIを呼ばない
- `createChat()`, `createMessages()`, `updateTitle()`, `predictTitle()` を呼ばない
- `listChats()`, `findChatById()`, `listMessages()` を呼ばない
- チャット履歴サイドバーや過去履歴への導線は非表示または無効化する
- 過去チャットURLからの復元は行わない

CloudWatch等にも、質問本文、回答本文、会話履歴、個人情報に該当し得る内容を出さない。

注意:

- 保存なしモードはフロントエンドで `/chats` 呼び出しを止めるためのもの。
- `kaigo_api` Lambda側でも、本文ログを出さない実装とログ保存なし設定を別途行う。

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

今回のパッチでは、`kaigo_api` Lambda stub、CDK Construct案、既存スタックへの条件付き組み込み、Web環境変数へ `VITE_APP_KAIGO_API_ENDPOINT` を渡す入口を追加する。OpenAI APIへの実接続、APIキー設定、AWS/CDKデプロイは行わない。

## kaigo_api Lambda stub

`packages/cdk/lambda/kaigoApiChat.ts` を、将来の自社管理API用Lambda雛形として追加する。

現段階の役割:

- `POST /api/chat` または `POST /api/chat/stream` から呼ばれる想定
- 入力は `mode`, `messages`, `usecase`, `clientRequestId` 程度に限定する
- `messages` の role は `user` と `assistant` のみ受け付ける
- `system` role は受け付けない
- SYSTEM_PROMPTは将来Lambda側で固定する
- OpenAI GPTには接続しない
- 正常な入力でも `501 kaigo_api_not_implemented` を返す

ログ方針:

- 質問本文をCloudWatchへ出さない
- 回答本文をCloudWatchへ出さない
- 会話履歴をCloudWatchへ出さない
- SYSTEM_PROMPTをCloudWatchへ出さない
- 出してよいのは `requestId`, `status`, `latencyMs`, `errorType`, `stream`, `messageCount` 程度

## CDK配線案

`packages/cdk/lib/construct/kaigo-api.ts` を、API Gateway配線用Construct案として追加する。

想定構成:

```text
KaigoApi Construct
  |
  +-- RestApi: kaigo-api-{appEnv}
  |     |
  |     +-- POST /api/chat
  |     +-- POST /api/chat/stream
  |     +-- OPTIONS preflight
  |
  +-- CognitoUserPoolsAuthorizer
  |     |
  |     +-- 既存Cognito User Poolを参照
  |
  +-- NodejsFunction: kaigoApiChat.ts
        |
        +-- OPENAI_API_KEY_SECRET_ARN
        +-- OPENAI_MODEL
        +-- LOG_LEVEL
```

CDK上の方針:

- `KaigoApi` は既存 `Api` Constructとは別Constructにする
- Bedrock用 `Predict` / `PredictStream` Lambdaには触らない
- 既存Bedrock権限は削除しない
- `KaigoApi` Lambdaには `bedrock:InvokeModel` を付与しない
- `KaigoApi` Lambdaには会話ログ保存用DynamoDB権限を付与しない
- OpenAI APIキーのSecret ARNが渡された場合だけ、そのSecretの読み取り権限をLambdaへ付与する
- Secret ARNが空の場合は、Secret参照もSecret読み取り権限も付与しない

## 条件付き組み込み方針

`KaigoApi` Constructは、既存スタックへ条件付きで組み込む。

```ts
const kaigoApi = params.kaigoApiEnabled
  ? new KaigoApi(this, 'KaigoApi', {
      appEnv: params.appEnv,
      userPool: auth.userPool,
      openAiApiKeySecretArn: params.kaigoApiOpenAiSecretArn,
      openAiModel: params.kaigoApiOpenAiModel,
      logLevel: params.logLevel,
    })
  : undefined;
```

デフォルトでは `kaigoApiEnabled=false` とし、API Gateway、Lambda、Cognito Authorizer、Secrets Manager参照を作成しない。

デフォルト無効にする理由:

- OpenAI API実接続が未実装であるため
- OpenAI APIキーをまだ設定しないため
- CloudWatch本文非出力、レート制限、監視、費用管理の本番確認が未完了のため
- 誤って施設向け本番配布を再開しないため
- 既存Bedrock APIを壊さず段階的に移行するため

`kaigoApiEnabled=true` の場合のみ、以下を作成する。

- `KaigoApi` 用 API Gateway
- `kaigoApiChat.ts` Lambda
- 既存Cognito User Poolを使うCognito Authorizer
- Secret ARN指定時のSecrets Manager読み取り権限
- WAF設定がある場合のkaigo_api API GatewayへのWAF関連付け
- CloudFormation Output `KaigoApiEndpoint`

## 設定項目

CDKパラメータ:

| 設定名 | 既定値 | 用途 |
| --- | --- | --- |
| `kaigoApiEnabled` | `false` | `KaigoApi` Constructを作成するか |
| `kaigoApiOpenAiSecretArn` | `''` | OpenAI APIキーを格納したSecrets Manager Secret ARN |
| `kaigoApiOpenAiModel` | `''` | 将来Lambda側で使うOpenAIモデル名 |
| `aiProvider` | `'bedrock'` | フロントのAI接続先切替 |
| `chatHistoryMode` | `'enabled'` | 会話ログ保存モード |

Web環境変数:

| 環境変数 | 本番想定値 | 用途 |
| --- | --- | --- |
| `VITE_APP_AI_PROVIDER` | `kaigo_api` | フロントからkaigo_apiを使う |
| `VITE_APP_KAIGO_API_ENDPOINT` | kaigo_apiのAPI Gateway URL | kaigo_api呼び出し先 |
| `VITE_APP_CHAT_HISTORY_MODE` | `disabled` | `/chats` 系保存を止める |

`VITE_APP_KAIGO_API_ENDPOINT` は、`WebProps.kaigoApiEndpointUrl` 経由でdeploy-time buildへ渡す。`kaigoApiEnabled=false` の場合は空文字を渡す。

## 本番向け想定値

施設向け本番では、以下を想定する。

```ts
kaigoApiEnabled: true,
kaigoApiOpenAiSecretArn: 'arn:aws:secretsmanager:...',
kaigoApiOpenAiModel: 'gpt-...',
aiProvider: 'kaigo_api',
chatHistoryMode: 'disabled',
kaigoAiReleasePaused: false, // 施設配布再開を正式判断した後に限る
```

Web側に渡る値:

```text
VITE_APP_AI_PROVIDER=kaigo_api
VITE_APP_KAIGO_API_ENDPOINT=<kaigo_api API Gateway URL>
VITE_APP_CHAT_HISTORY_MODE=disabled
```

Bedrockは施設向け本番では使わない。ただし移行途中では既存Bedrock処理と権限は削除せず、切り離し完了後に別パッチで整理する。

## 本番デプロイ前の確認事項

施設配布前に、少なくとも以下を確認する。

1. `kaigoApiEnabled=true` でkaigo_api API GatewayとLambdaが作成されること
2. `VITE_APP_AI_PROVIDER=kaigo_api` がWebへ渡ること
3. `VITE_APP_KAIGO_API_ENDPOINT` にkaigo_api API Gateway URLが渡ること
4. `VITE_APP_CHAT_HISTORY_MODE=disabled` がWebへ渡ること
5. OpenAI APIキーをSecrets Managerへ登録し、コードやREADMEに書かれていないこと
6. LambdaからSecretを取得する実装を追加すること
7. OpenAI GPTへの実接続を追加すること
8. SYSTEM_PROMPTがLambda側で固定され、フロントに返らないこと
9. CloudWatchへ質問本文、回答本文、会話履歴、SYSTEM_PROMPTが出ないこと
10. API GatewayにCognito Authorizerが付いていること
11. `KaigoApi` LambdaにBedrock権限が付いていないこと
12. 会話ログ保存用DynamoDB権限が付いていないこと
13. レート制限、予算アラート、障害時表示を確認すること
14. 施設配布再開前に停止フラグ解除の承認手順を決めること

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
- `VITE_APP_CHAT_HISTORY_MODE=disabled` でセッション内のみのチャットにする

## 今回は実装しない範囲

- OpenAI APIキー設定
- OpenAI API実接続
- AWS/CDKデプロイ
- Bedrock権限削除
- `kaigo_api` Lambda側のログ保存なし実装
- 源内AI会員版接続
- 施設配布再開

## 施設配布再開までの残課題

1. `kaigo_api` のAPI仕様確定
2. OpenAI APIキーのSecrets Manager管理
3. Lambda側のSYSTEM_PROMPT固定
4. CloudWatchへ本文を出さない実装
5. 会話ログ保存なしモードの本番有効化
6. サイドバー履歴・復元導線の整理
7. Cognito Authorizerの確認
8. Rate limit、監視、予算アラート
9. 障害時メッセージ
10. 本番停止フラグ解除手順
