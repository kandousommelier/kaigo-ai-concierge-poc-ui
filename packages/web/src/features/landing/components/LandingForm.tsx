import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { Button } from '@/components/ui/dads/Button';
import { ErrorText } from '@/components/ui/dads/ErrorText';
import { SupportText } from '@/components/ui/dads/SupportText';
import { SendIcon } from '@/components/ui/icons/SendIcon';
import { ChatNotificationDialog } from '@/features/chat/components/ChatNotificationDialog';
import { ChatNotificationDialogButton } from '@/features/chat/components/ChatNotificationDialogButton';
import {
  KAIGO_AI_RELEASE_PAUSED,
  KAIGO_AI_RELEASE_PAUSED_MESSAGE,
} from '@/features/kaigo/constants';
import { TOP_CHAT_SYSTEM_PROMPT, TOP_CHAT_SYSTEM_PROMPT_TITLE } from '@/features/landing/constants';
import { LandingChatFormSchema, landingChatFormSchema } from '@/features/landing/schema';
import { isSubmitKey } from '@/utils/keyboard';

export const LandingForm = () => {
  const navigate = useNavigate();
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LandingChatFormSchema>({
    resolver: zodResolver(landingChatFormSchema),
  });

  const onSubmit = handleSubmit((data) => {
    if (KAIGO_AI_RELEASE_PAUSED) {
      return;
    }

    navigate('/chat', {
      state: {
        content: data.chatInput,
        systemContext: TOP_CHAT_SYSTEM_PROMPT,
        systemContextTitle: TOP_CHAT_SYSTEM_PROMPT_TITLE,
        autoSubmit: true,
      },
    });
  });

  return (
    <div className='mt-8 lg:mt-10'>
      <h2 id='landing-chat-input-heading' className='mb-2 text-std-20B-160'>
        介護現場の困りごとや改善したいことを入力してください
        <span className='text-std-16N-170'>
          {KAIGO_AI_RELEASE_PAUSED
            ? '（現在は確認作業中のため送信できません）'
            : '（送信したらチャット画面に遷移します）'}
        </span>
      </h2>
      <form onSubmit={onSubmit}>
        <div className='flex flex-col gap-4'>
          <SupportText id='chat-input-support'>
            例）記録時間、ICT定着、申し送り短縮、委員会運営など、困っていることをそのまま入力してください。
          </SupportText>
          {KAIGO_AI_RELEASE_PAUSED && (
            <p className='rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-3 text-std-16N-170 text-solid-gray-800'>
              {KAIGO_AI_RELEASE_PAUSED_MESSAGE}
            </p>
          )}
          <div className='flex items-center gap-4 lg:gap-6'>
            <ChatNotificationDialogButton onClick={() => setIsNotificationDialogOpen(true)} />
          </div>
          <AutoResizeTextarea
            id='chat-input'
            placeholder='例）申し送りを短くしたいです。職員向け説明文と1週間の試し方を作ってください。'
            aria-labelledby='landing-chat-input-heading'
            aria-describedby={
              errors.chatInput ? 'chat-input-support chat-input-error' : 'chat-input-support'
            }
            aria-invalid={errors.chatInput ? true : undefined}
            required
            disabled={KAIGO_AI_RELEASE_PAUSED}
            rows={3}
            onKeyDown={(e) => {
              if (isSubmitKey(e)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            {...register('chatInput')}
          />

          <div className='flex justify-end'>
            {errors.chatInput && (
              <ErrorText className='mr-auto -mt-1' id='chat-input-error'>
                ＊{errors.chatInput.message}
              </ErrorText>
            )}
            <Button
              type='submit'
              size='md'
              variant='solid-fill'
              aria-disabled={KAIGO_AI_RELEASE_PAUSED || undefined}
              className='inline-flex justify-center items-center gap-1'
            >
              <SendIcon aria-hidden={true} className='shrink-0' />
              送信
            </Button>
          </div>
        </div>
      </form>
      <ChatNotificationDialog
        isOpen={isNotificationDialogOpen}
        onClose={() => setIsNotificationDialogOpen(false)}
      />
    </div>
  );
};
