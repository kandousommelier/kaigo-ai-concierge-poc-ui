# kaigo_api 検証環境デプロイ手順書

## 目的

この手順書は、介護現場AIコンシェルジュを施設向け本番に出す前に、検証環境で `kaigo_api` を確認するためのものです。

施設向け本番では Amazon Bedrock を使わず、AWS上の自社管理APIである `kaigo_api` から OpenAI GPT を呼び出す構成を想定します。

この文書は手順整理用です。ここでは AWS/CDKデプロイ、Secrets Manager登録、OpenAI API実接続、施設配布再開は行いません。

## 今回の前提

- 自社管理APIは AWS上に置く
- LLMは OpenAI GPT を使う
- 認証は現行Cognitoを使う
- 会話ログは保存しない
- SYSTEM_PROMPTはLambda側で固定し、フロントには返さない
- OpenAI APIキーとSYSTEM_PROMPTはSecrets Managerで管理する
- CloudWatchに質問本文、回答本文、会話履歴、SYSTEM_PROMPTを出さない
- Bedrockは施設向け本番では使わない
- 源内AI会員版には接続しない

## デプロイ前に必要な設定値

検証環境で `kaigo_api` を有効にする場合は、CDKパラメータに以下を設定します。

| 設定名 | 検証環境の想定値 | 説明 |
| --- | --- | --- |
| `kaigoApiEnabled` | `true` | `kaigo_api` 用 API Gateway / Lambda を作成する |
| `kaigoApiOpenAiSecretArn` | `<OpenAI APIキーSecret ARN>` | OpenAI APIキーを格納したSecrets Manager Secret |
| `kaigoApiSystemPromptSecretArn` | `<SYSTEM_PROMPT Secret ARN>` | 介護現場AIコンシェルジュ用SYSTEM_PROMPTを格納したSecret |
| `kaigoApiOpenAiModel` | `<検証用OpenAIモデル名>` | Lambdaから呼び出すOpenAIモデル |
| `aiProvider` | `kaigo_api` | フロントから `kaigo_api` を使う |
| `chatHistoryMode` | `disabled` | `/chats` 系APIへの保存を止める |
| `kaigoAiReleasePaused` | 原則 `true` | 施設配布を止めたままにする。検証担当者だけでUI疎通する段階で、承認後に検証環境だけ `false` にする |

Web側には、CDKから以下の値が渡る想定です。

| Web環境変数 | 想定値 | 確認内容 |
| --- | --- | --- |
| `VITE_APP_AI_PROVIDER` | `kaigo_api` | Bedrockではなく `kaigo_api` を選ぶ |
| `VITE_APP_KAIGO_API_ENDPOINT` | `<kaigo_api API Gateway URL>` | フロントが呼び出すAPI URL |
| `VITE_APP_CHAT_HISTORY_MODE` | `disabled` | 会話ログ保存なしモード |
| `VITE_APP_KAIGO_AI_RELEASE_PAUSED` | `true` または検証時のみ `false` | 本番配布停止状態を制御する |

`kaigoAiReleasePaused=false` は、施設配布再開を意味しないように扱ってください。検証環境で、検証担当者がAPI疎通と画面挙動を確認する場合に限り、事前承認のうえで一時的に使います。

`kaigoApiOpenAiSecretArn` と `kaigoApiSystemPromptSecretArn` には、AWS Secrets Managerが表示する完全ARNを使います。Secret名だけ、または末尾のランダム6文字を含まないARNは使わないでください。

## Secrets Managerに登録するもの

### OpenAI APIキー

Secret名の例:

- `/kaigo-ai/verification/openai-api-key`
- `/kaigo-ai/production/openai-api-key`

Secret値の例:

```json
{
  "OPENAI_API_KEY": "<ここに検証用APIキーを登録する>"
}
```

実際のAPIキーは、GitHub、README、docs、画面キャプチャ、チャット、メール本文に書かないでください。

### SYSTEM_PROMPT

Secret名の例:

- `/kaigo-ai/verification/system-prompt`
- `/kaigo-ai/production/system-prompt`

Secret値の例:

```json
{
  "KAIGO_SYSTEM_PROMPT": "<ここに介護現場AIコンシェルジュ用SYSTEM_PROMPTを登録する>"
}
```

本番SYSTEM_PROMPT本文は、GitHub、README、docs、画面、ビルド成果物に含めない運用にします。プロンプトを更新する場合も、コード変更ではなくSecret更新で行います。

## 検証環境デプロイ前チェック

デプロイ前に、ローカルで以下を確認します。

```bash
npm -w packages/cdk run build
npm -w packages/web exec tsc -- --noEmit
npm run web:build
```

AWS反映前に差分確認だけ行う場合は、承認された検証環境名を使って `cdk diff` を実行します。

```bash
npm -w packages/cdk run cdk -- diff --all -c env=<検証環境キー>
```

`cdk diff` で、少なくとも以下を確認してください。

- `kaigo_api` 用API Gatewayが作成される
- `kaigo_api` 用Lambdaが作成される
- Cognito Authorizerが既存User Poolを参照している
- LambdaにOpenAI APIキーSecretの読み取り権限が付く
- LambdaにSYSTEM_PROMPT Secretの読み取り権限が付く
- `kaigo_api` LambdaにBedrock権限が付かない
- 会話ログ保存用DynamoDB権限が付かない
- API Gateway生成の4XX/5XX応答にもCORSヘッダーが付く

実際の `cdk deploy` は、この文書作成時点では実行しません。

## 検証環境へ反映する場合の流れ

実施承認後、検証環境でのみ以下の順番で進めます。

1. Secrets ManagerにOpenAI APIキーを登録する
2. Secrets ManagerにSYSTEM_PROMPTを登録する
3. CDKパラメータにSecret ARNと検証用設定値を入れる
4. `cdk diff` で作成リソースと権限を確認する
5. 問題がなければ、検証環境へCDKデプロイする
6. CloudFrontのWeb画面を開く
7. Cognitoで検証用アカウントにログインする
8. `VITE_APP_AI_PROVIDER=kaigo_api` と `VITE_APP_KAIGO_API_ENDPOINT` が反映されていることを確認する
9. ブラウザのNetworkで `POST /api/chat/stream` に送信されることを確認する
10. 検証担当者だけでチャット疎通を確認する
11. CloudWatch、Cost Explorer、OpenAI利用量を確認する

施設向け本番配布は、この検証が完了するまで再開しません。

## 検証環境で確認すること

### 認証とAPI到達

- Cognitoログインできる
- ブラウザのNetworkで `Authorization` ヘッダーが付いている
- `VITE_APP_KAIGO_API_ENDPOINT` の `kaigo_api` に到達している
- 送信先が `POST /api/chat/stream` になっている
- 認証切れの場合に 401 / 403 として扱われる
- Cognito認証失敗時にCORS errorだけに見えない

### 入力とプロンプト保護

- フロントから `system` role を送らない
- 意図的に `system` role を送る検証ではLambda側で拒否される
- フロントからSYSTEM_PROMPT本文を送っていない
- フロントへSYSTEM_PROMPT本文が返っていない
- `modelId` や `llmType` を `kaigo_api` へ送っていない
- Bedrock向け `model` を `kaigo_api` へ送っていない
- payloadが `mode`, `messages`, `usecase`, `clientRequestId` のみに絞られている
- `messages` が `user` / `assistant` role と `content` のみに絞られている
- 入力サイズ制限が効く
- 大きすぎる入力で本文をログに出さず400系エラーになる

### ストリーミング表示

- Lambdaから返るNDJSON `{ "text": "..." }` が画面に表示される
- API Gateway Lambda proxy構成では完全な逐次配信にならない可能性がある
- まずは非逐次NDJSON風レスポンスで検証する
- 本番前にトークン単位の逐次表示が必要な場合は、Lambda response streaming等を検討する

### 会話ログ保存なし

- `VITE_APP_CHAT_HISTORY_MODE=disabled` が反映されている
- `/chats` 系APIが呼ばれない
- 会話履歴サイドバーに保存されない
- ブラウザ更新やタブを閉じると会話が消える
- DynamoDB等に会話本文が保存されない

### CloudWatchログ

CloudWatch Logsに以下が出ていないことを確認します。

- 質問本文
- 回答本文
- 会話履歴
- SYSTEM_PROMPT本文
- 個人情報に該当し得る内容

ログに出してよいものは、以下の範囲に限定します。

- requestId
- status
- latencyMs
- stream
- messageCount
- errorType

### エラー表示

以下のエラーが、利用者に分かりやすく表示されることを確認します。

- 401 / 403: 認証切れ、再ログイン案内
- 429: 利用集中、時間を置いて再試行する案内
- 500系: 一時的な障害案内
- 501: `kaigo_api` には到達したがOpenAI接続が未有効である案内
- Secret未設定: 検証担当者向けに設定不足と分かる案内
- system role混入: 不正な入力として扱う
- CORS: 認証失敗やAPI GatewayエラーがCORS errorだけに見えない

現在の `Access-Control-Allow-Origin: *` は検証用の扱いです。本番ではCloudFront Origin等に絞るか、施設配布前に判断してください。

### OpenAI利用量と費用

検証環境でもOpenAI利用料は発生します。以下を確認します。

- OpenAIダッシュボードで利用量が確認できる
- 想定外の急増がない
- AWS側のLambda / API Gateway / CloudWatch Logs費用が確認できる
- AWS BudgetsまたはOpenAI側の利用上限・通知を設定する
- 検証終了後に利用停止できる

## 5カテゴリ回答確認

施設配布前に、少なくとも以下の5カテゴリで回答を確認します。

1. 見守り機器・補助金相談
2. 介護記録・外国人職員支援
3. ICT導入後の定着支援
4. 申し送り短縮
5. 生産性向上委員会・会議運営

確認観点:

- 介護現場向けの平易な日本語で回答する
- 成果物だけでなく、課題解決の壁打ちとして返す
- 個人情報を入力しない注意が画面に残っている
- 回答が一般的なAIチャット用途に広がりすぎない
- 「施策の検討段階」で使う体験環境であることが伝わる

## ロールバック手順

検証中に問題が出た場合は、施設配布を再開せず、停止状態へ戻します。

### 設定を戻す

CDKパラメータを以下に戻します。

```ts
kaigoApiEnabled: false,
aiProvider: 'kaigo_api',
chatHistoryMode: 'disabled',
kaigoAiReleasePaused: true,
```

`aiProvider` は `bedrock` に戻しません。施設向け本番でBedrockを使わない方針を維持し、画面側は一時停止状態にします。

### Cognitoユーザーを無効化する

AWSコンソールの場合:

1. Amazon Cognitoを開く
2. 対象User Poolを開く
3. 検証用ユーザーを選ぶ
4. ユーザーを無効化する

AWS CLIで行う場合:

```bash
aws cognito-idp admin-disable-user \
  --user-pool-id <UserPoolId> \
  --username <検証用ユーザー名> \
  --region <リージョン>
```

実際のユーザー名、User Pool ID、AWS認証情報はdocsやGitHubに書かないでください。

### Secretの扱い

検証を止める場合は、以下を確認します。

- OpenAI APIキーSecretを無効化、削除、またはローテーションする
- SYSTEM_PROMPT Secretを必要に応じて削除またはアクセス制限する
- LambdaからSecret参照権限が外れていることを確認する

## 施設配布前チェックリスト

施設向けに再開する前に、以下をすべて確認します。

- 検証環境で5カテゴリの回答確認が完了している
- 個人情報入力禁止の注意がトップ画面、チャット画面、注意事項に残っている
- 会話ログが保存されない
- `/chats` 系APIが呼ばれない
- CloudWatchに質問本文、回答本文、会話履歴、SYSTEM_PROMPTが出ていない
- OpenAI側のデータ保持方針、学習利用方針、契約条件を最新の公式情報で確認している
- OpenAI利用量の予算アラートまたは上限管理を設定している
- AWS Budgetsを設定している
- Rate limitまたは利用集中時の停止手順がある
- Cognitoの検証用アカウントと施設向けアカウントの扱いが整理されている
- 施設向けURL、ID、パスワードの共有方法が非公開運用になっている
- 利用停止手順を管理者が実行できる
- 障害時に `kaigoAiReleasePaused=true` へ戻せる

## GitHubやdocsに書かないもの

以下は絶対にGitHub、README、docs、Issue、画面キャプチャ、共有チャットに書かないでください。

- OpenAI APIキー
- SYSTEM_PROMPT本文
- AWS認証情報
- Secret ARNを含む本番固有情報
- Cognitoの実ID・実パスワード
- 施設名、職員名、利用者名
- 会話ログ
- 管理画面URL

## 次段階で必要な判断

検証環境の確認後、施設配布前に以下を判断します。

- 非逐次NDJSONで十分か、Lambda response streamingが必要か
- OpenAIモデルと利用上限をどう設定するか
- 施設別アカウントを作るか、限定共通アカウントで始めるか
- 予算アラート超過時に自動停止するか
- SYSTEM_PROMPT更新手順を誰が管理するか
- 会話ログを保存しない方針を利用案内にどう明記するか
