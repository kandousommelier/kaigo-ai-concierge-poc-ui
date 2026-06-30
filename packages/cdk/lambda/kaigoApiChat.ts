import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

type KaigoChatRole = 'user' | 'assistant';

type KaigoChatMessage = {
  role: KaigoChatRole;
  content: string;
};

type KaigoChatRequest = {
  mode: string;
  messages: KaigoChatMessage[];
  usecase?: string;
  clientRequestId?: string;
};

class RequestValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RequestValidationError';
    this.code = code;
  }
}

class ConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
  }
}

class OpenAiApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = 'OpenAiApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

const ndjsonHeaders = {
  ...headers,
  'Content-Type': 'application/x-ndjson; charset=utf-8',
};

const MAX_REQUEST_BODY_LENGTH = 80_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CONTENT_LENGTH = 8_000;
const MAX_TOTAL_CONTENT_LENGTH = 24_000;
const MAX_MODE_LENGTH = 40;
const MAX_USECASE_LENGTH = 80;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;
const MAX_SYSTEM_PROMPT_LENGTH = 40_000;

const allowedRoles: readonly KaigoChatRole[] = ['user', 'assistant'];
const allowedTopLevelFields = new Set(['mode', 'messages', 'usecase', 'clientRequestId']);
const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';

const secretsManager = new SecretsManagerClient({});
let cachedOpenAiApiKey: string | undefined;
let cachedSystemPrompt: string | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const createJsonResponse = (
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
};

const createNdjsonResponse = (body: string): APIGatewayProxyResult => {
  return {
    statusCode: 200,
    headers: ndjsonHeaders,
    body,
  };
};

const validateStringLength = (value: string, maxLength: number, code: string) => {
  if (value.length > maxLength) {
    throw new RequestValidationError(code, 'Request value is too large.');
  }
};

const parseBody = (event: APIGatewayProxyEvent): unknown => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : event.body;

  if (!rawBody) {
    throw new RequestValidationError('empty_body', 'Request body is required.');
  }

  if (rawBody.length > MAX_REQUEST_BODY_LENGTH) {
    throw new RequestValidationError('request_body_too_large', 'Request body is too large.');
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RequestValidationError('invalid_json', 'Request body must be valid JSON.');
  }
};

const parseMessage = (value: unknown): KaigoChatMessage => {
  if (!isRecord(value)) {
    throw new RequestValidationError('invalid_message', 'Each message must be an object.');
  }

  if (value.role === 'system') {
    throw new RequestValidationError(
      'system_prompt_not_allowed',
      'System prompt must be fixed in Lambda and must not be sent from the frontend.',
    );
  }

  if (typeof value.role !== 'string' || !allowedRoles.includes(value.role as KaigoChatRole)) {
    throw new RequestValidationError('invalid_role', 'Message role must be user or assistant.');
  }

  if (typeof value.content !== 'string') {
    throw new RequestValidationError('invalid_content', 'Message content must be a string.');
  }

  validateStringLength(
    value.content,
    MAX_MESSAGE_CONTENT_LENGTH,
    'message_content_too_large',
  );

  return {
    role: value.role as KaigoChatRole,
    content: value.content,
  };
};

const parseRequest = (body: unknown): KaigoChatRequest => {
  if (!isRecord(body)) {
    throw new RequestValidationError('invalid_body', 'Request body must be an object.');
  }

  const unsupportedField = Object.keys(body).find((field) => !allowedTopLevelFields.has(field));
  if (unsupportedField) {
    throw new RequestValidationError(
      'unsupported_request_field',
      'Request contains an unsupported field.',
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new RequestValidationError('invalid_messages', 'messages must be a non-empty array.');
  }

  if (body.messages.length > MAX_MESSAGES) {
    throw new RequestValidationError('too_many_messages', 'Too many messages were provided.');
  }

  const mode = typeof body.mode === 'string' && body.mode.trim() ? body.mode : 'standard';
  const usecase = typeof body.usecase === 'string' ? body.usecase : undefined;
  const clientRequestId =
    typeof body.clientRequestId === 'string' ? body.clientRequestId : undefined;
  const messages = body.messages.map(parseMessage);
  const totalContentLength = messages.reduce((total, message) => total + message.content.length, 0);

  validateStringLength(mode, MAX_MODE_LENGTH, 'mode_too_large');
  if (usecase) {
    validateStringLength(usecase, MAX_USECASE_LENGTH, 'usecase_too_large');
  }
  if (clientRequestId) {
    validateStringLength(
      clientRequestId,
      MAX_CLIENT_REQUEST_ID_LENGTH,
      'client_request_id_too_large',
    );
  }
  if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
    throw new RequestValidationError(
      'total_content_too_large',
      'Total message content is too large.',
    );
  }

  return {
    mode,
    messages,
    usecase,
    clientRequestId,
  };
};

const getRequiredEnvironmentValue = (name: string, code: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigurationError(code, `${name} is not configured.`);
  }
  return value;
};

const extractSecretText = (secretValue: string, candidateKeys: string[]): string | undefined => {
  const trimmed = secretValue.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }

    const value = candidateKeys
      .map((key) => parsed[key])
      .find((candidate): candidate is string => {
        return typeof candidate === 'string' && candidate.trim().length > 0;
      });

    return value?.trim();
  } catch {
    return trimmed;
  }
};

const getSecretValue = async (secretArn: string): Promise<string | undefined> => {
  const secret = await secretsManager.send(
    new GetSecretValueCommand({
      SecretId: secretArn,
    }),
  );

  return (
    secret.SecretString ??
    (secret.SecretBinary ? Buffer.from(secret.SecretBinary).toString('utf-8') : undefined)
  );
};

const getOpenAiApiKey = async (): Promise<string> => {
  if (cachedOpenAiApiKey) {
    return cachedOpenAiApiKey;
  }

  const secretArn = getRequiredEnvironmentValue(
    'OPENAI_API_KEY_SECRET_ARN',
    'openai_api_key_secret_not_configured',
  );
  const secretValue = await getSecretValue(secretArn);
  const apiKey = secretValue
    ? extractSecretText(secretValue, [
        'OPENAI_API_KEY',
        'openaiApiKey',
        'openAiApiKey',
        'apiKey',
      ])
    : undefined;

  if (!apiKey) {
    throw new ConfigurationError(
      'openai_api_key_not_configured',
      'OpenAI API key is not configured in Secrets Manager.',
    );
  }

  cachedOpenAiApiKey = apiKey;
  return apiKey;
};

const getSystemPrompt = async (): Promise<string> => {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  const secretArn = getRequiredEnvironmentValue(
    'KAIGO_SYSTEM_PROMPT_SECRET_ARN',
    'kaigo_system_prompt_secret_not_configured',
  );
  const secretValue = await getSecretValue(secretArn);
  const systemPrompt = secretValue
    ? extractSecretText(secretValue, [
        'KAIGO_SYSTEM_PROMPT',
        'SYSTEM_PROMPT',
        'systemPrompt',
        'prompt',
      ])
    : undefined;

  if (!systemPrompt) {
    throw new ConfigurationError(
      'kaigo_system_prompt_not_configured',
      'System prompt is not configured in Secrets Manager.',
    );
  }

  if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    throw new ConfigurationError(
      'kaigo_system_prompt_too_large',
      'System prompt is too large.',
    );
  }

  cachedSystemPrompt = systemPrompt;
  return systemPrompt;
};

const getOpenAiModel = (): string => {
  return getRequiredEnvironmentValue('OPENAI_MODEL', 'openai_model_not_configured');
};

const buildSystemInstructions = (systemPrompt: string, mode: string): string => {
  const normalizedMode =
    mode.toLowerCase().includes('express') || mode.includes('エクスプレス')
      ? 'エクスプレス提案モード'
      : 'スタンダード提案モード';

  return `${systemPrompt}

現在の提案モード: ${normalizedMode}`;
};

const buildOpenAiRequestBody = (
  request: KaigoChatRequest,
  systemPrompt: string,
  stream: boolean,
) => {
  return {
    model: getOpenAiModel(),
    instructions: buildSystemInstructions(systemPrompt, request.mode),
    input: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stream,
  };
};

const getOpenAiErrorCode = (statusCode: number): string => {
  if (statusCode === 429) {
    return 'openai_rate_limited';
  }
  if (statusCode >= 500) {
    return 'openai_server_error';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'openai_auth_error';
  }
  return 'openai_api_error';
};

const callOpenAiResponsesApi = async (
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> => {
  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new OpenAiApiError(
      getOpenAiErrorCode(response.status),
      response.status,
      'OpenAI API request failed.',
    );
  }

  return response;
};

const extractOpenAiText = (responseBody: unknown): string => {
  if (!isRecord(responseBody)) {
    return '';
  }

  if (typeof responseBody.output_text === 'string') {
    return responseBody.output_text;
  }

  const output = Array.isArray(responseBody.output) ? responseBody.output : [];
  return output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        return [];
      }

      return item.content.flatMap((contentItem) => {
        if (!isRecord(contentItem)) {
          return [];
        }

        if (typeof contentItem.text === 'string') {
          return [contentItem.text];
        }

        return [];
      });
    })
    .join('');
};

const extractOpenAiStreamDelta = (event: unknown): string | undefined => {
  if (!isRecord(event)) {
    return undefined;
  }

  if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
    return event.delta;
  }

  if (event.type === 'response.refusal.delta' && typeof event.delta === 'string') {
    return event.delta;
  }

  return undefined;
};

const toNdjsonLine = (payload: Record<string, unknown>): string => {
  return `${JSON.stringify(payload)}\n`;
};

const collectOpenAiStreamAsNdjson = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new OpenAiApiError('openai_stream_unavailable', 502, 'OpenAI stream is unavailable.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let ndjson = '';

  const handleSseBlock = (block: string) => {
    const dataLines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart());

    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join('\n');
    if (data === '[DONE]') {
      return;
    }

    try {
      const delta = extractOpenAiStreamDelta(JSON.parse(data) as unknown);
      if (delta) {
        ndjson += toNdjsonLine({ text: delta });
      }
    } catch {
      throw new OpenAiApiError(
        'openai_stream_parse_error',
        502,
        'OpenAI stream could not be parsed.',
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      handleSseBlock(block);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleSseBlock(buffer);
  }

  return ndjson;
};

const createClientErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'openai_api_key_secret_not_configured':
    case 'openai_api_key_not_configured':
    case 'kaigo_system_prompt_secret_not_configured':
    case 'kaigo_system_prompt_not_configured':
    case 'kaigo_system_prompt_too_large':
    case 'openai_model_not_configured':
      return 'AI相談機能の設定が未完了です。管理者に確認してください。';
    case 'openai_rate_limited':
      return '現在、AI相談機能の利用が集中しています。少し時間をおいて再度お試しください。';
    case 'openai_auth_error':
      return 'AI相談機能の認証設定を確認できませんでした。管理者に確認してください。';
    case 'openai_server_error':
    case 'openai_stream_unavailable':
    case 'openai_stream_parse_error':
    case 'openai_api_error':
      return 'AI相談機能で一時的な問題が発生しました。時間をおいて再度お試しください。';
    default:
      return 'リクエストを処理できませんでした。入力内容を短くするなどして、再度お試しください。';
  }
};

const getErrorResponseStatusCode = (
  error: OpenAiApiError | ConfigurationError | RequestValidationError,
): number => {
  if (error instanceof RequestValidationError) {
    return 400;
  }

  if (error instanceof ConfigurationError) {
    return 500;
  }

  if (error.statusCode === 429) {
    return 429;
  }

  if (error.statusCode >= 500) {
    return 502;
  }

  return 500;
};

const logSafe = (level: 'info' | 'warn' | 'error', payload: Record<string, unknown>) => {
  console[level](JSON.stringify(payload));
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  const startedAt = Date.now();
  const requestId = context.awsRequestId;

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return createJsonResponse(405, {
      error: 'method_not_allowed',
      requestId,
    });
  }

  try {
    const request = parseRequest(parseBody(event));
    const isStream = event.path.endsWith('/stream');
    const [apiKey, systemPrompt] = await Promise.all([getOpenAiApiKey(), getSystemPrompt()]);
    const openAiRequestBody = buildOpenAiRequestBody(request, systemPrompt, isStream);

    if (isStream) {
      const openAiResponse = await callOpenAiResponsesApi(apiKey, openAiRequestBody);
      const ndjson = await collectOpenAiStreamAsNdjson(openAiResponse);

      logSafe('info', {
        requestId,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        stream: true,
        messageCount: request.messages.length,
      });

      return createNdjsonResponse(ndjson);
    }

    const openAiResponse = await callOpenAiResponsesApi(apiKey, openAiRequestBody);
    const responseBody = (await openAiResponse.json()) as unknown;
    const message = extractOpenAiText(responseBody);

    logSafe('info', {
      requestId,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      stream: false,
      messageCount: request.messages.length,
    });

    return createJsonResponse(200, {
      message,
      stopReason: 'end_turn',
      requestId,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      logSafe('warn', {
        requestId,
        status: 'bad_request',
        latencyMs: Date.now() - startedAt,
        errorType: error.code,
      });

      return createJsonResponse(getErrorResponseStatusCode(error), {
        error: error.code,
        message: createClientErrorMessage(error.code),
        requestId,
      });
    }

    if (error instanceof ConfigurationError || error instanceof OpenAiApiError) {
      logSafe('error', {
        requestId,
        status: 'upstream_error',
        latencyMs: Date.now() - startedAt,
        errorType: error.code,
      });

      return createJsonResponse(getErrorResponseStatusCode(error), {
        error: error.code,
        message: createClientErrorMessage(error.code),
        requestId,
      });
    }

    logSafe('error', {
      requestId,
      status: 'internal_error',
      latencyMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : 'unknown_error',
    });

    return createJsonResponse(500, {
      error: 'internal_error',
      requestId,
    });
  }
};
