import { InvokeWithResponseStreamCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  CreateChatResponse,
  CreateMessagesRequest,
  CreateMessagesResponse,
  PredictRequest,
  PredictResponse,
  PredictTitleRequest,
  PredictTitleResponse,
  UpdateTitleRequest,
  UpdateTitleResponse,
} from 'genai-web';
import { genUApi } from '@/lib/fetcher';
import { decomposeId } from '@/utils/decomposeId';

type AiProvider = 'bedrock' | 'kaigo_api';

export const createChat = async () => {
  const res = await genUApi.post<CreateChatResponse>('chats', {});
  return res.data;
};

export const createMessages = async (_chatId: string, req: CreateMessagesRequest) => {
  const chatId = decomposeId(_chatId);
  const res = await genUApi.post<CreateMessagesResponse>(`chats/${chatId}/messages`, req);
  return res.data;
};

export const deleteChat = async (chatId: string) => {
  return genUApi.delete<void>(`chats/${chatId}`);
};

export const updateTitle = async (chatId: string, title: string) => {
  const req: UpdateTitleRequest = {
    title,
  };
  const res = await genUApi.put<UpdateTitleResponse>(`chats/${chatId}/title`, req);
  return res.data;
};

export const predict = async (req: PredictRequest): Promise<string> => {
  const res = await genUApi.post<PredictResponse>('predict', req);
  return res.data;
};

const getAiProvider = (): AiProvider => {
  const provider = import.meta.env.VITE_APP_AI_PROVIDER?.trim().toLowerCase();
  return provider === 'kaigo_api' ? 'kaigo_api' : 'bedrock';
};

export async function* predictStream(req: PredictRequest) {
  if (getAiProvider() === 'kaigo_api') {
    throw new Error(
      'kaigo_api provider is not implemented yet. OpenAI GPTへの実接続は、API仕様、認証方式、ログ保存方針、Secrets Manager管理が確定してから実装してください。',
    );
  }

  yield* predictStreamWithBedrock(req);
}

async function* predictStreamWithBedrock(req: PredictRequest) {
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) {
    throw new Error('認証されていません。');
  }

  const region = import.meta.env.VITE_APP_REGION;
  const userPoolId = import.meta.env.VITE_APP_USER_POOL_ID;
  const idPoolId = import.meta.env.VITE_APP_IDENTITY_POOL_ID;
  const providerName = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const lambda = new LambdaClient({
    region,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region },
      identityPoolId: idPoolId,
      logins: {
        [providerName]: token,
      },
    }),
  });

  const res = await lambda.send(
    new InvokeWithResponseStreamCommand({
      FunctionName: import.meta.env.VITE_APP_PREDICT_STREAM_FUNCTION_ARN,
      Payload: JSON.stringify(req),
    }),
  );
  const events = res.EventStream!;

  for await (const event of events) {
    if (event.PayloadChunk) {
      yield new TextDecoder('utf-8').decode(event.PayloadChunk.Payload);
    }

    if (event.InvokeComplete) {
      break;
    }
  }
}

export const predictTitle = async (req: PredictTitleRequest) => {
  const res = await genUApi.post<PredictTitleResponse>('predict/title', req);
  return res.data;
};
