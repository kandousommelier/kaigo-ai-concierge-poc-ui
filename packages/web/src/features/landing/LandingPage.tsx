import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageTitle } from '@/components/PageTitle';
import { Button } from '@/components/ui/dads/Button';
import { APP_TITLE } from '@/constants';
import { ChatNotificationDialog } from '@/features/chat/components/ChatNotificationDialog';
import {
  KAIGO_ANSWER_POSITION_TEXT,
  KAIGO_EXAMPLE_PROMPTS,
  KAIGO_PROHIBITED_INPUT_TEXT,
  KAIGO_SERVICE_NAME,
  KAIGO_SYSTEM_PROMPT,
  KAIGO_TOP_DESCRIPTION,
} from '@/features/kaigo/constants';
import { LayoutBody } from '@/layout/LayoutBody';
import { LandingForm } from './components/LandingForm';

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
    navigate('/chat', {
      state: {
        content,
        systemContext: KAIGO_SYSTEM_PROMPT,
        systemContextTitle: KAIGO_SERVICE_NAME,
        autoSubmit: true,
      },
    });
  };

  return (
    <LayoutBody>
      <PageTitle title={APP_TITLE || KAIGO_SERVICE_NAME} />
      <div className='mx-auto px-6 max-w-(--page-width) lg:px-8 pb-24'>
        <section className='py-6 lg:py-8'>
          <h2 className='text-std-28B-150 lg:text-std-32B-150'>
            {KAIGO_SERVICE_NAME}でできること
          </h2>
          <p className='mt-4 max-w-4xl text-std-18N-160 text-solid-gray-800'>
            {KAIGO_TOP_DESCRIPTION}
          </p>
        </section>

        <LandingForm />

        <section className='mt-10'>
          <h2 className='mb-4 text-std-24B-150'>相談例</h2>
          <ul className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {KAIGO_EXAMPLE_PROMPTS.map((example) => (
              <li key={example}>
                <Button
                  type='button'
                  variant='outline'
                  size='md'
                  className='h-full w-full justify-start whitespace-normal text-left!'
                  onClick={() => startWithExample(example)}
                >
                  {example}
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className='mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <div className='rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-4'>
            <h2 className='mb-2 text-std-20B-150'>入力してはいけないこと</h2>
            <p className='text-std-16N-170 text-solid-gray-800'>{KAIGO_PROHIBITED_INPUT_TEXT}</p>
          </div>
          <div className='rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-4'>
            <h2 className='mb-2 text-std-20B-150'>回答の位置づけ</h2>
            <p className='text-std-16N-170 text-solid-gray-800'>{KAIGO_ANSWER_POSITION_TEXT}</p>
          </div>
        </section>
      </div>
      <ChatNotificationDialog
        isOpen={isNotificationDialogOpen}
        onClose={closeNotificationDialog}
      />
    </LayoutBody>
  );
};
