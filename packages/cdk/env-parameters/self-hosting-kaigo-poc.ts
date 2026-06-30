import { StackInput } from '../lib/stack-input';

const kaigoSystemPrompt = '';

export const selfHostingKaigoPocParams: Partial<StackInput> = {
  appEnv: 'kaigo-poc',
  logLevel: 'INFO',

  selfSignUpEnabled: false,
  samlAuthEnabled: false,
  allowedIpV4AddressRanges: null,
  allowedIpV6AddressRanges: null,

  hiddenUseCases: {
    generate: true,
    translate: true,
    image: true,
    diagram: true,
  },
  govais_for_homepage: [],
  // TODO: 補助金、法改正、加算、行政通知、ガイドラインは将来RAGで最新公式資料を参照できるようにする。
  top_chat_system_prompt: kaigoSystemPrompt,
  top_chat_system_prompt_title: '介護現場AIコンシェルジュ',
  kaigoAiReleasePaused: true,
  hideModelIdsFromUsers: true,
  aiProvider: 'bedrock',
  chatHistoryMode: 'disabled',
  kaigoApiEnabled: false,
  kaigoApiOpenAiSecretArn: '',
  kaigoApiSystemPromptSecretArn: '',
  kaigoApiOpenAiModel: '',

  modelRegion: 'ap-northeast-1',
  monitoring: true,
  dataRetentionDays: {
    dynamoDbTtl: 90,
    s3FileExpiration: 30,
  },
};
