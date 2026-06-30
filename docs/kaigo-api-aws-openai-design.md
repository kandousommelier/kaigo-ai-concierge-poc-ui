# 介護現場AIコンシェルジュ kaigo_api 設計メモ

## 方針

施設向け本番では Amazon Bedrock を使わず、AWS上に自社管理の `kaigo_api` を置き、そこから OpenAI GPT を呼び出す構成にする。

今回の段階では、`kaigo_api` LambdaにOpenAI Responses API接続準備を追加する。ただし、OpenAI APIキー設定、SYSTEM_PROMPT Secret登録、本番デプロイ、AWS/CDKデプロイ、Bedrock権限削除、施設配布再開は行わない。

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
  | OpenAI APIキーをSecrets Managerから取得
  | SYSTEM_PROMPTをSecrets Managerから取得
  | 会話ログは保存しない
  | 本文をCloudWatchへ出さない
  v
OpenAI GPT
```

## 認証

現行Cognitoを使う。施設職員はこれまで通りCognitoでログインし、`kaigo_api` 側はAPI GatewayのCognito Authorizerで認可する。

OpenAI APIキーはフロントエンドへ渡さない。Lambda側でSecrets Managerから取得する。

## SYSTEM_PROMPT管理

本番SYSTEM_PROMPTはコードに直書きしない。Lambdaは `KAIGO_SYSTEM_PROMPT_SECRET_ARN` で指定したSecrets Manager Secretから取得する。

Secrets Managerを採用する理由:

- OpenAI APIキーと同じ仕組みで管理でき、CDKの権限付与を最小化しやすい
- 本番プロンプト本文をGitHub、README、画面、ビルド成果物に含めずに済む
- 将来プロンプト更新時に、コード変更ではなくSecret更新で切り替えやすい
- SSM Parameter Storeも候補だが、今回はAPIキー管理とそろえてSecrets Managerに統一する

運用方針:

- フロントから本番プロンプトを送らない
- フロントへ本番プロンプトを返さない
- 利用者がプロンプトを閲覧・編集できない
- 源内AI会員版に本番プロンプトを保存しない
- SYSTEM_PROMPTをCloudWatchへ出さない

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

## CloudWatchログ方針

Lambdaでは質問本文、回答本文、会話履歴、SYSTEM_PROMPT、個人情報に該当し得る内容をCloudWatchへ出さない。

ログに出してよいものは、以下のような運用情報に限定する。

- requestId
- status
- latencyMs
- stream
- messageCount
- errorType

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

- `system` role は受け付けない
- トップレベルでは `mode`, `messages`, `usecase`, `clientRequestId` 以外を扱わない
- SYSTEM_PROMPT本文はLambda側でSecretから取得する
- `modelId` や `llmType` はフロントから送らない

### 出力

非ストリーミング:

```json
{
  "message": "回答本文",
  "stopReason": "end_turn"
}
```

ストリーミング:

- `POST /api/chat/stream`
- NDJSON: 1行ごとに `{ "text": "..." }`

現行UIとの互換性を優先し、既存 `StreamingChunk` に近いNDJSON形式で扱う。

現在のAPI Gateway Lambda proxy構成では、OpenAI側のストリームをLambda内でNDJSONへ変換して返す。完全なトークン単位の逐次配信にならない可能性があるため、まずは非逐次NDJSON風レスポンスとして進める。

本番でトークン単位の逐次表示が必須になった場合は、Lambda response streaming、HTTP API、または別のストリーミング構成を検討する。

## 入力サイズ制限

`kaigo_api` Lambdaでは、費用、タイムアウト、メモリ、意図しない大量入力を抑えるため、入力サイズを制限する。

| 定数 | 値 | 用途 |
| --- | --- | --- |
| `MAX_REQUEST_BODY_LENGTH` | `80_000` | リクエスト本文全体の最大文字数 |
| `MAX_MESSAGES` | `20` | 会話履歴として受け付ける最大メッセージ数 |
| `MAX_MESSAGE_CONTENT_LENGTH` | `8_000` | 1メッセージの最大文字数 |
| `MAX_TOTAL_CONTENT_LENGTH` | `24_000` | 全メッセージ本文の合計最大文字数 |
| `MAX_MODE_LENGTH` | `40` | `mode` の最大文字数 |
| `MAX_USECASE_LENGTH` | `80` | `usecase` の最大文字数 |
| `MAX_CLIENT_REQUEST_ID_LENGTH` | `128` | `clientRequestId` の最大文字数 |
| `MAX_SYSTEM_PROMPT_LENGTH` | `40_000` | Secretから取得するSYSTEM_PROMPTの最大文字数 |

制限を超えた場合は、本文をログに出さず、400系のエラーを返す。

## Bedrock切り離し

施設向け本番ではBedrockを使わない。段階的に以下を進める。

1. `VITE_APP_AI_PROVIDER=kaigo_api` のstubを追加する
2. `kaigo_api` の正式API仕様を確定する
3. フロントの `predictStream()` をProvider分岐する
4. `/chats` 保存を無効化するモードを追加する
5. CDKで `kaigo_api` 用API Gateway + Lambda + Secrets Manager参照を追加する
6. `kaigo_api` 本番ではBedrock権限を付けない

今回のパッチでは、`kaigo_api` LambdaにOpenAI Responses API接続準備を追加する。OpenAI APIキー設定、SYSTEM_PROMPT Secret登録、AWS/CDKデプロイ、施設配布再開は行わない。

## kaigo_api Lambda OpenAI接続実装

`packages/cdk/lambda/kaigoApiChat.ts` は、自社管理API用LambdaとしてOpenAI GPTを呼び出す準備を持つ。

実装方針:

- `POST /api/chat` または `POST /api/chat/stream` から呼ばれる想定
- 入力は `mode`, `messages`, `usecase`, `clientRequestId` 程度に限定する
- 上記以外のトップレベル項目は受け付けない
- `messages` の role は `user` と `assistant` のみ受け付ける
- `system` role は受け付けない
- SYSTEM_PROMPTはコードに置かず、`KAIGO_SYSTEM_PROMPT_SECRET_ARN` で指定したSecretから取得する
- OpenAI APIキーは `OPENAI_API_KEY_SECRET_ARN` で指定したSecretから取得する
- Secret値はプレーン文字列、または `OPENAI_API_KEY` / `KAIGO_SYSTEM_PROMPT` 等のキーを含むJSONを想定する
- フロントからSYSTEM_PROMPT、`modelId`、`llmType` は送らない
- `OPENAI_MODEL` はLambda環境変数で指定する
- `/api/chat/stream` ではOpenAIのストリーミング応答をNDJSON `{ "text": "..." }` へ変換する
- `/api/chat` では非ストリーミング応答として `{ "message": "...", "stopReason": "end_turn" }` を返す

## フロントからkaigo_apiへの接続

`VITE_APP_AI_PROVIDER=kaigo_api` の場合、Webフロントは `VITE_APP_KAIGO_API_ENDPOINT` を基点に `POST /api/chat/stream` を呼び出す。

送信時の方針:

- Cognitoログイン済みユーザーのIDトークンを取得し、`Authorization: Bearer <token>` を付ける
- 送信payloadは `mode`, `messages`, `usecase`, `clientRequestId` のみに絞る
- `messages` は `user` / `assistant` role と `content` のみにする
- 画面内部に保持している `system` role は送らない
- SYSTEM_PROMPT本文は送らない
- `modelId`, `llmType`, Bedrock向け `model` は送らない
- `mode` は最新ユーザーメッセージ内の「エクスプレス提案モード」等から推定し、それ以外は `standard` とする

レスポンスはNDJSON形式を想定する。

```json
{ "text": "回答の一部" }
```

API Gateway Lambda proxy構成では、完全な逐次配信にならず、Lambda側でまとめて返したNDJSON風レスポンスになる可能性がある。現行UIではこの非逐次NDJSONでも表示できるようにし、本番前にトークン単位の逐次表示が必要かを判断する。

エラー表示は利用者向けの一般文言に丸める。Secret名、環境変数名、内部エラー詳細は画面に出さない。

エラー処理:

- OpenAI APIキーSecret ARN未設定: `openai_api_key_secret_not_configured`
- OpenAI APIキー未設定: `openai_api_key_not_configured`
- SYSTEM_PROMPT Secret ARN未設定: `kaigo_system_prompt_secret_not_configured`
- SYSTEM_PROMPT未設定: `kaigo_system_prompt_not_configured`
- OpenAIモデル未設定: `openai_model_not_configured`
- 入力サイズ超過: `request_body_too_large`, `too_many_messages`, `message_content_too_large`, `total_content_too_large` 等
- `system` role混入: `system_prompt_not_allowed`
- OpenAI 429: `openai_rate_limited`
- OpenAI 500系: `openai_server_error`
- OpenAI認証エラー: `openai_auth_error`
- ストリーム取得・解析エラー: `openai_stream_unavailable` / `openai_stream_parse_error`

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
        +-- KAIGO_SYSTEM_PROMPT_SECRET_ARN
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
- SYSTEM_PROMPTのSecret ARNが渡された場合だけ、そのSecretの読み取り権限をLambdaへ付与する
- Secret ARNが空の場合は、Secret参照もSecret読み取り権限も付与しない
- API Gatewayが生成する `DEFAULT_4XX` / `DEFAULT_5XX` 応答にもCORSヘッダーを付ける
- Cognito認証失敗、トークン期限切れ、API Gateway側エラーが、ブラウザ上で単なるCORS errorに見えないようにする
- 現在の `Access-Control-Allow-Origin: *` は検証用の扱いとし、本番ではCloudFront Origin等に絞るか判断する

## 条件付き組み込み方針

`KaigoApi` Constructは、既存スタックへ条件付きで組み込む。

```ts
const kaigoApi = params.kaigoApiEnabled
  ? new KaigoApi(this, 'KaigoApi', {
      appEnv: params.appEnv,
      userPool: auth.userPool,
      openAiApiKeySecretArn: params.kaigoApiOpenAiSecretArn,
      systemPromptSecretArn: params.kaigoApiSystemPromptSecretArn,
      openAiModel: params.kaigoApiOpenAiModel,
      logLevel: params.logLevel,
    })
  : undefined;
```

デフォルトでは `kaigoApiEnabled=false` とし、API Gateway、Lambda、Cognito Authorizer、Secrets Manager参照を作成しない。

`kaigoApiEnabled=true` の場合のみ、以下を作成する。

- `KaigoApi` 用 API Gateway
- `kaigoApiChat.ts` Lambda
- 既存Cognito User Poolを使うCognito Authorizer
- OpenAI APIキーSecret ARN指定時のSecrets Manager読み取り権限
- SYSTEM_PROMPT Secret ARN指定時のSecrets Manager読み取り権限
- WAF設定がある場合のkaigo_api API GatewayへのWAF関連付け
- CloudFormation Output `KaigoApiEndpoint`

## 設定項目

CDKパラメータ:

| 設定名 | 既定値 | 用途 |
| --- | --- | --- |
| `kaigoApiEnabled` | `false` | `KaigoApi` Constructを作成するか |
| `kaigoApiOpenAiSecretArn` | `''` | OpenAI APIキーを格納したSecrets Manager Secret ARN |
| `kaigoApiSystemPromptSecretArn` | `''` | SYSTEM_PROMPTを格納したSecrets Manager Secret ARN |
| `kaigoApiOpenAiModel` | `''` | Lambda側で使うOpenAIモデル名 |
| `aiProvider` | `'bedrock'` | フロントのAI接続先切替 |
| `chatHistoryMode` | `'enabled'` | 会話ログ保存モード |

`kaigoApiOpenAiSecretArn` と `kaigoApiSystemPromptSecretArn` には、AWS Secrets Managerが表示する完全ARNを設定する。Secret名だけ、または末尾のランダム6文字を含まないARNは使わない。

Web環境変数:

| 環境変数 | 本番想定値 | 用途 |
| --- | --- | --- |
| `VITE_APP_AI_PROVIDER` | `kaigo_api` | フロントからkaigo_apiを使う |
| `VITE_APP_KAIGO_API_ENDPOINT` | kaigo_apiのAPI Gateway URL | kaigo_api呼び出し先 |
| `VITE_APP_CHAT_HISTORY_MODE` | `disabled` | `/chats` 系保存を止める |

## 本番向け想定値

施設向け本番では、以下を想定する。

```ts
kaigoApiEnabled: true,
kaigoApiOpenAiSecretArn: 'arn:aws:secretsmanager:...',
kaigoApiSystemPromptSecretArn: 'arn:aws:secretsmanager:...',
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
6. SYSTEM_PROMPTをSecrets Managerへ登録し、コードやREADMEに書かれていないこと
7. Lambdaへ `OPENAI_API_KEY_SECRET_ARN`, `KAIGO_SYSTEM_PROMPT_SECRET_ARN`, `OPENAI_MODEL` が渡ること
8. ステージング環境でOpenAI GPTへの疎通、NDJSON変換、エラー表示を検証すること
9. SYSTEM_PROMPTがフロントに返らないこと
10. CloudWatchへ質問本文、回答本文、会話履歴、SYSTEM_PROMPTが出ないこと
11. 入力サイズ制限が効くこと
12. API GatewayにCognito Authorizerが付いていること
13. `KaigoApi` LambdaにBedrock権限が付いていないこと
14. 会話ログ保存用DynamoDB権限が付いていないこと
15. API Gateway生成の4XX/5XX応答にもCORSヘッダーが付いていること
16. Cognito認証失敗、期限切れ時にブラウザでCORS errorだけにならず、適切に扱えること
17. フロントから `POST /api/chat/stream` へ送信されること
18. Authorizationヘッダーが付いていること
19. payloadに `system` role、SYSTEM_PROMPT、`modelId`、`llmType`、Bedrock向け `model` が含まれないこと
20. 非逐次NDJSONで十分か、Lambda response streamingが必要か判断すること
21. レート制限、予算アラート、障害時表示を確認すること
22. 施設配布再開前に停止フラグ解除の承認手順を決めること

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

## 今回は実装しない範囲

- OpenAI APIキー設定
- SYSTEM_PROMPT Secret登録
- OpenAI APIの実環境疎通
- AWS/CDKデプロイ
- Bedrock権限削除
- 源内AI会員版接続
- 施設配布再開

## 施設配布再開までの残課題

1. OpenAI APIキーのSecrets Manager管理
2. SYSTEM_PROMPTのSecrets Manager管理
3. CloudWatchへ本文が出ないことのステージング確認
4. 会話ログ保存なしモードの本番有効化
5. サイドバー履歴・復元導線の整理
6. Cognito Authorizerの確認
7. 入力サイズ制限とRate limitの確認
8. 監視、予算アラート
9. 障害時メッセージ
10. 非逐次NDJSONで進めるか、Lambda response streamingへ切り替えるかの判断
11. 本番停止フラグ解除手順
