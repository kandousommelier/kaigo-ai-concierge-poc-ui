import { Duration } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface KaigoApiProps {
  appEnv: string;
  userPool: UserPool;
  openAiApiKeySecretArn?: string | null;
  openAiModel?: string | null;
  allowedOrigins?: string[];
  logLevel?: string;
}

export class KaigoApi extends Construct {
  readonly api: RestApi;
  readonly chatFunction: NodejsFunction;
  readonly apiEndpointUrl: string;

  constructor(scope: Construct, id: string, props: KaigoApiProps) {
    super(scope, id);

    const allowedOrigins =
      props.allowedOrigins && props.allowedOrigins.length > 0
        ? props.allowedOrigins
        : Cors.ALL_ORIGINS;

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
    });

    const chatFunction = new NodejsFunction(this, 'ChatFunction', {
      runtime: Runtime.NODEJS_22_X,
      entry: './lambda/kaigoApiChat.ts',
      timeout: Duration.seconds(60),
      memorySize: 256,
      environment: {
        OPENAI_API_KEY_SECRET_ARN: props.openAiApiKeySecretArn ?? '',
        OPENAI_MODEL: props.openAiModel ?? '',
        LOG_LEVEL: props.logLevel ?? 'INFO',
      },
    });

    if (props.openAiApiKeySecretArn) {
      const openAiApiKeySecret = Secret.fromSecretCompleteArn(
        this,
        'OpenAiApiKeySecret',
        props.openAiApiKeySecretArn,
      );
      openAiApiKeySecret.grantRead(chatFunction);
    }

    const api = new RestApi(this, 'Api', {
      restApiName: props.appEnv ? `kaigo-api-${props.appEnv}` : 'kaigo-api',
      deployOptions: {
        stageName: props.appEnv || 'dev',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: ['OPTIONS', 'POST'],
        allowHeaders: Cors.DEFAULT_HEADERS,
      },
    });

    const lambdaIntegration = new LambdaIntegration(chatFunction);
    const apiResource = api.root.addResource('api');
    const chatResource = apiResource.addResource('chat');

    const methodOptions = {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    };

    chatResource.addMethod('POST', lambdaIntegration, methodOptions);
    chatResource.addResource('stream').addMethod('POST', lambdaIntegration, methodOptions);

    this.api = api;
    this.chatFunction = chatFunction;
    this.apiEndpointUrl = api.url;
  }
}
