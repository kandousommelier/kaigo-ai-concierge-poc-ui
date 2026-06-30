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

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

const allowedRoles: readonly KaigoChatRole[] = ['user', 'assistant'];

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

const parseBody = (event: APIGatewayProxyEvent): unknown => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : event.body;

  if (!rawBody) {
    throw new RequestValidationError('empty_body', 'Request body is required.');
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

  return {
    role: value.role as KaigoChatRole,
    content: value.content,
  };
};

const parseRequest = (body: unknown): KaigoChatRequest => {
  if (!isRecord(body)) {
    throw new RequestValidationError('invalid_body', 'Request body must be an object.');
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new RequestValidationError('invalid_messages', 'messages must be a non-empty array.');
  }

  const mode = typeof body.mode === 'string' && body.mode.trim() ? body.mode : 'standard';
  const usecase = typeof body.usecase === 'string' ? body.usecase : undefined;
  const clientRequestId =
    typeof body.clientRequestId === 'string' ? body.clientRequestId : undefined;

  return {
    mode,
    messages: body.messages.map(parseMessage),
    usecase,
    clientRequestId,
  };
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

    logSafe('info', {
      requestId,
      status: 'stub_not_implemented',
      latencyMs: Date.now() - startedAt,
      stream: event.path.endsWith('/stream'),
      messageCount: request.messages.length,
    });

    return createJsonResponse(501, {
      error: 'kaigo_api_not_implemented',
      message:
        'kaigo_api is a stub. OpenAI GPT connection will be implemented after API, auth, logging, and Secrets Manager design are finalized.',
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

      return createJsonResponse(400, {
        error: error.code,
        message: error.message,
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
