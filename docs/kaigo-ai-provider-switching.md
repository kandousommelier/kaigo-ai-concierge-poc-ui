# 介護現場AIコンシェルジュ AI接続先切り替えメモ

## 現時点の前提

現在の実装では、フロントエンドから `PredictStream` Lambda を呼び出し、Lambda 側で Amazon Bedrock を呼び出しています。
今回の変更では、この呼び出し経路は変更していません。

本番配布前の安全化として、画面からの送信可否は `VITE_APP_KAIGO_AI_RELEASE_PAUSED` で切り替えます。

- 未指定の場合、ローカル開発では送信可能です。
- 未指定の場合、本番ビルドでは送信停止です。
- 本番配布向けは `true` を指定します。
- 検証環境だけ再開する場合は `false` を指定します。

## 将来 `AI_PROVIDER` で切り替える場合の整理対象

将来、源内AIなど別のAI接続先へ切り替える場合は、次の責務を分ける必要があります。

### フロントエンド

- `packages/web/src/lib/chatApi.ts`
  - 現在は `predictStream()` が Lambda の `InvokeWithResponseStream` を直接呼び出しています。
  - 将来は `AI_PROVIDER` ごとに送信先を切り替える境界にします。

- `packages/web/src/hooks/useChat.ts`
  - チャット作成、メッセージ保存、ストリーミング応答の組み立てを行っています。
  - Provider 差し替え時も、画面側の会話状態はここに閉じ込めるのが安全です。

- `packages/web/src/models.ts`
  - 現在は `VITE_APP_MODEL_IDS` を Bedrock モデルとして扱います。
  - 施設職員向けにはモデルIDを表示せず、内部選択値としてだけ扱います。

### バックエンド / CDK

- `packages/cdk/lambda/predictStream.ts`
  - 現在のストリーミング応答生成の入口です。

- `packages/cdk/lambda/utils/bedrockApi.ts`
  - Bedrock Runtime への依存が集中しています。
  - 将来は `aiProvider/bedrockApi.ts` のように分離し、別Providerの実装を追加できる形にします。

- `packages/cdk/lambda/utils/allowedModels.ts`
  - 現在は Bedrock / SageMaker のモデル許可判定です。
  - 外部API型Providerでは、モデルIDではなく接続先・用途単位の許可判定に変える可能性があります。

- `packages/cdk/lib/construct/api.ts`
  - Lambda環境変数、Bedrock権限、API Gateway、Cognitoロール許可を組み立てています。
  - Bedrock以外を使う場合は、Bedrock権限を付けない構成を選べるようにします。

- `packages/cdk/lib/construct/web.ts`
  - フロントエンドのビルド時環境変数を渡しています。
  - `VITE_APP_AI_PROVIDER` は将来の切り替え用の予約値です。

## 次の実装方針

大改修する場合は、まず次の順で進めます。

1. `chatApi.ts` に Provider 境界を作る。
2. Bedrock 呼び出しを `bedrockProvider` として既存挙動のまま移す。
3. CDK で `aiProvider` に応じた権限と環境変数を分ける。
4. 源内AIなど外部Providerの正式API仕様、認証方式、利用規約、課金主体を確認してから実装する。

源内AIへの仮接続や、未確認の外部API接続は行わないでください。
