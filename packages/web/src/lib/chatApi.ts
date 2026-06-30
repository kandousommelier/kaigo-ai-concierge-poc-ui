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
type KaigoApiRole = 'user' | 'assistant';

type KaigoApiMessage = {
  role: KaigoApiRole;
  content: string;
};

type KaigoApiErrorBody = {
  error?: string;
  message?: string;
  requestId?: string;
};

const KAIGO_API_STREAM_PATH = '/api/chat/stream';

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
    yield* predictStreamWithKaigoApi(req);
    return;
  }

  yield* predictStreamWithBedrock(req);
}

const getKaigoApiEndpoint = (): string => {
  const endpoint = import.meta.env.VITE_APP_KAIGO_API_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error('AI相談機能の接続先設定が未完了です。管理者に確認してください。');
  }
  return endpoint;
};

const buildKaigoApiUrl = (baseEndpoint: string, path: string): string => {
  return `${baseEndpoint.replace(/\/+$/, '')}${path}`;
};

const getCognitoIdToken = async (): Promise<string> => {
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) {
    throw new Error('ログイン状態を確認できませんでした。再ログインしてください。');
  }
  return token;
};

const normalizeKaigoApiMessages = (req: PredictRequest): KaigoApiMessage[] => {
  return req.messages
    .filter((message): message is KaigoApiMessage => {
      return (
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string'
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
};

const getLatestUserMessageContent = (messages: KaigoApiMessage[]): string => {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
};

const inferKaigoApiMode = (messages: KaigoApiMessage[]): string => {
  const latestUserMessage = getLatestUserMessageContent(messages);
  if (
    latestUserMessage.includes('エクスプレス提案モード') ||
    latestUserMessage.toLowerCase().includes('express')
  ) {
    return 'express';
  }
  return 'standard';
};

const getClientRequestId = (): string => {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const buildKaigoApiPayload = (req: PredictRequest) => {
  const messages = normalizeKaigoApiMessages(req);
  return {
    mode: inferKaigoApiMode(messages),
    messages,
    usecase: req.id,
    clientRequestId: getClientRequestId(),
  };
};

const parseKaigoApiErrorBody = async (res: Response): Promise<KaigoApiErrorBody | undefined> => {
  const text = await res.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as KaigoApiErrorBody;
  } catch {
    return undefined;
  }
};

const formatRequestIdSuffix = (requestId?: string): string => {
  return requestId ? `（確認番号: ${requestId}）` : '';
};

const createKaigoApiErrorMessage = (status: number, body?: KaigoApiErrorBody): string => {
  const suffix = formatRequestIdSuffix(body?.requestId);
  switch (status) {
    case 400:
      return `入力内容が大きすぎる、または形式が正しくありません。少し短くして再度お試しください。${suffix}`;
    case 401:
    case 403:
      return `ログイン期限が切れている可能性があります。再ログインしてからお試しください。${suffix}`;
    case 429:
      return `現在、AI相談機能の利用が集中しています。少し時間をおいて再度お試しください。${suffix}`;
    case 501:
      return `AI相談機能は検証環境で準備中です。管理者にOpenAI接続設定の有効化状況を確認してください。${suffix}`;
    default:
      if (status >= 500) {
        return `AI相談機能で一時的な問題が発生しました。時間をおいて再度お試しください。${suffix}`;
      }
      return `AI相談機能への接続に失敗しました。ログイン状態や通信環境を確認してください。${suffix}`;
  }
};

const normalizeKaigoApiStreamLine = (line: string): string | undefined => {
  if (!line.trim()) {
    return undefined;
  }

  let payload: { text?: unknown; message?: unknown; stopReason?: unknown };
  try {
    payload = JSON.parse(line) as { text?: unknown; message?: unknown; stopReason?: unknown };
  } catch {
    throw new Error('AI相談機能の応答形式を読み取れませんでした。時間をおいて再度お試しください。');
  }

  if (typeof payload.text === 'string') {
    return JSON.stringify({
      text: payload.text,
      stopReason: typeof payload.stopReason === 'string' ? payload.stopReason : undefined,
    });
  }

  if (typeof payload.message === 'string') {
    return JSON.stringify({
      text: payload.message,
      stopReason: typeof payload.stopReason === 'string' ? payload.stopReason : 'end_turn',
    });
  }

  if (typeof payload.stopReason === 'string') {
    return JSON.stringify({
      text: '',
      stopReason: payload.stopReason,
    });
  }

  return undefined;
};

async function* readKaigoApiNdjson(res: Response) {
  const decoder = new TextDecoder('utf-8');
  const reader = res.body?.getReader();
  let buffer = '';
  let hasStopReason = false;

  const drainLines = function* (lines: string[]) {
    for (const line of lines) {
      const normalizedLine = normalizeKaigoApiStreamLine(line);
      if (!normalizedLine) {
        continue;
      }
      const parsed = JSON.parse(normalizedLine) as { stopReason?: string };
      if (parsed.stopReason) {
        hasStopReason = true;
      }
      yield `${normalizedLine}\n`;
    }
  };

  if (!reader) {
    buffer = await res.text();
  } else {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      yield* drainLines(lines);
    }

    buffer += decoder.decode();
  }

  if (buffer.trim()) {
    yield* drainLines(buffer.split('\n'));
  }

  if (!hasStopReason) {
    yield `${JSON.stringify({ text: '', stopReason: 'end_turn' })}\n`;
  }
}

async function* predictStreamWithKaigoApi(req: PredictRequest) {
  const token = await getCognitoIdToken();
  const endpoint = getKaigoApiEndpoint();
  const payload = buildKaigoApiPayload(req);

  if (payload.messages.length === 0) {
    throw new Error('送信できるメッセージがありません。入力内容を確認してください。');
  }

  let res: Response;
  try {
    res = await fetch(buildKaigoApiUrl(endpoint, KAIGO_API_STREAM_PATH), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      'AI相談機能へ接続できませんでした。通信環境、ログイン状態、API設定を確認してください。',
    );
  }

  if (!res.ok) {
    const errorBody = await parseKaigoApiErrorBody(res);
    throw new Error(createKaigoApiErrorMessage(res.status, errorBody));
  }

  yield* readKaigoApiNdjson(res);
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
