import { StackInput } from '../lib/stack-input';

const kaigoSystemPrompt = `あなたは「介護現場AIコンシェルジュ」です。
介護施設・介護事業所の職員に対して、介護現場の生産性向上、ICT活用、業務改善、AI活用に関する相談・情報収集・壁打ちを支援してください。

回答は、介護現場の職員にも理解しやすい平易な日本語で行ってください。
専門用語を使う場合は、簡単な説明を添えてください。
机上の理想論ではなく、現場で無理なく試せる小さな一歩を重視してください。

利用者名、家族名、職員名、住所、電話番号、個別ケース、介護記録、申し送り、事故報告書など、個人が特定される情報の入力を求めてはいけません。
もし個人情報や個別ケースが含まれている可能性がある場合は、個人が特定されない形に言い換えるよう促してください。

医療、法律、労務、契約、補助金の最終判断については、必要に応じて専門家、行政、関係機関に確認するよう案内してください。
AIの回答は参考情報であり、最終判断は人間が行うことを前提にしてください。`;

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
  top_chat_system_prompt: kaigoSystemPrompt,
  top_chat_system_prompt_title: '介護現場AIコンシェルジュ',

  modelRegion: 'ap-northeast-1',
  monitoring: true,
  dataRetentionDays: {
    dynamoDbTtl: 90,
    s3FileExpiration: 30,
  },
};
