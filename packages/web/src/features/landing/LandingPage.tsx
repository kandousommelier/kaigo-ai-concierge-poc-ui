import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageTitle } from '@/components/PageTitle';
import { Button } from '@/components/ui/dads/Button';
import { APP_TITLE } from '@/constants';
import { ChatNotificationDialog } from '@/features/chat/components/ChatNotificationDialog';
import {
  KAIGO_AI_RELEASE_PAUSED,
  KAIGO_AI_RELEASE_PAUSED_DETAIL,
  KAIGO_AI_RELEASE_PAUSED_MESSAGE,
  KAIGO_EXAMPLE_PROMPT_CATEGORIES,
  KAIGO_EXAMPLE_PROMPTS,
  KAIGO_INTENDED_USE_TEXT,
  KAIGO_REASK_PROMPTS,
  KAIGO_RECOMMENDED_USAGE_STEPS,
  KAIGO_SERVICE_NAME,
  KAIGO_SHORT_USAGE_DESCRIPTION,
  KAIGO_TOP_DESCRIPTION,
  KAIGO_USAGE_NOTES,
} from '@/features/kaigo/constants';
import { LayoutBody } from '@/layout/LayoutBody';
import { LandingForm } from './components/LandingForm';
import { TOP_CHAT_SYSTEM_PROMPT, TOP_CHAT_SYSTEM_PROMPT_TITLE } from './constants';

export const LandingPage = () => {
  const navigate = useNavigate();
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem('kaigo-ai-notice-confirmed')) {
      setIsNotificationDialogOpen(true);
    }
  }, []);

  const closeNotificationDialog = () => {
    sessionStorage.setItem('kaigo-ai-notice-confirmed', 'true');
    setIsNotificationDialogOpen(false);
  };

  const startWithExample = (content: string) => {
    if (KAIGO_AI_RELEASE_PAUSED) {
      return;
    }

    navigate('/chat', {
      state: {
        content,
        systemContext: TOP_CHAT_SYSTEM_PROMPT,
        systemContextTitle: TOP_CHAT_SYSTEM_PROMPT_TITLE,
        autoSubmit: true,
      },
    });
  };

  return (
    <LayoutBody>
      <PageTitle title={APP_TITLE || KAIGO_SERVICE_NAME} />
      <div className='mx-auto max-w-(--page-width) overflow-hidden px-6 pb-24 lg:px-8'>
        <section className='py-6 lg:py-8'>
          <h2 className='text-std-28B-150 lg:text-std-32B-150'>
            {KAIGO_SERVICE_NAME}でできること
          </h2>
          <p className='mt-4 max-w-4xl break-words text-std-18N-160 text-solid-gray-800 [overflow-wrap:anywhere]'>
            {KAIGO_TOP_DESCRIPTION}
          </p>
          <p className='mt-3 max-w-4xl break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
            {KAIGO_INTENDED_USE_TEXT}
          </p>
          {KAIGO_AI_RELEASE_PAUSED && (
            <div className='mt-6 rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-4 text-solid-gray-800'>
              <h3 className='text-std-20B-150'>試験利用を一時停止しています</h3>
              <p className='mt-2 text-std-16N-170'>{KAIGO_AI_RELEASE_PAUSED_MESSAGE}</p>
              <p className='mt-2 text-std-16N-170'>{KAIGO_AI_RELEASE_PAUSED_DETAIL}</p>
            </div>
          )}
        </section>

        <LandingForm />

        <section className='mt-10'>
          <h2 className='text-std-24B-150'>おすすめの使い方</h2>
          <p className='mt-3 max-w-4xl break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
            {KAIGO_SHORT_USAGE_DESCRIPTION}
          </p>
          <ol className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
            {KAIGO_RECOMMENDED_USAGE_STEPS.map((step, index) => (
              <li
                key={step}
                className='flex min-w-0 gap-3 rounded-8 border border-solid-gray-420 bg-white p-4'
              >
                <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-solid-gray-800 text-std-16B-170 text-white'>
                  {index + 1}
                </span>
                <span className='min-w-0 break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className='mt-10'>
          <h2 className='text-std-24B-150'>生成AI利用時の注意事項</h2>
          <p className='mt-3 max-w-4xl break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
            安全に便利に使うためのルールです。個人情報を入れず、回答は考えを整理する参考情報として活用してください。
          </p>
          <ul className='mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2'>
            {KAIGO_USAGE_NOTES.map((note) => (
              <li
                key={note}
                className='min-w-0 break-words rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-4 text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'
              >
                {note}
              </li>
            ))}
          </ul>
        </section>

        <section className='mt-10'>
          <h2 className='text-std-24B-150'>おすすめ質問例</h2>
          <p className='mt-3 max-w-4xl break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
            相談したい内容に近い例を押すと、そのままチャットを開始できます。施設名や利用者名は入れず、必要に応じて条件だけを足してください。
            {KAIGO_AI_RELEASE_PAUSED &&
              ' 現在は確認作業中のため、相談例からの開始は停止しています。'}
          </p>
          <ul className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
            {KAIGO_EXAMPLE_PROMPTS.map((example, index) => (
              <li key={example}>
                <Button
                  type='button'
                  variant='outline'
                  size='md'
                  className={`flex h-full w-full min-w-0 flex-col items-start justify-start gap-2 whitespace-normal break-words text-left! leading-relaxed [overflow-wrap:anywhere] ${
                    KAIGO_AI_RELEASE_PAUSED ? 'cursor-not-allowed opacity-70' : ''
                  }`}
                  aria-disabled={KAIGO_AI_RELEASE_PAUSED || undefined}
                  onClick={() => startWithExample(example)}
                >
                  <span className='min-w-0 break-words text-std-16B-170 text-blue-900 [overflow-wrap:anywhere]'>
                    {KAIGO_EXAMPLE_PROMPT_CATEGORIES[index]}
                  </span>
                  <span className='min-w-0 whitespace-pre-line break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
                    {example}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className='mt-10'>
          <h2 className='text-std-24B-150'>回答が合わないときの聞き直し方</h2>
          <p className='mt-3 max-w-4xl break-words text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'>
            回答が大きすぎる、現場に合わない、説明に使いにくいと感じたら、次のように聞き直してください。
          </p>
          <ul className='mt-4 grid grid-cols-1 gap-2 md:grid-cols-2'>
            {KAIGO_REASK_PROMPTS.map((prompt) => (
              <li
                key={prompt}
                className='min-w-0 break-words rounded-8 border border-solid-gray-420 bg-white px-4 py-3 text-std-16N-170 text-solid-gray-800 [overflow-wrap:anywhere]'
              >
                {prompt}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ChatNotificationDialog
        isOpen={isNotificationDialogOpen}
        onClose={closeNotificationDialog}
      />
    </LayoutBody>
  );
};
