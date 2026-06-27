import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { PageTitle } from '@/components/PageTitle';
import { BreadcrumbsNav } from '@/components/ui/BreadcrumbsNav';
import { Button } from '@/components/ui/dads/Button';
import { ProgressIndicator } from '@/components/ui/dads/ProgressIndicator';
import { APP_TITLE } from '@/constants';
import { ChatHints } from '@/features/chat/components/ChatHints';
import { ChatInput } from '@/features/chat/components/ChatInput';
import { ChatMessage } from '@/features/chat/components/ChatMessage';
import { ChatNotificationDialog } from '@/features/chat/components/ChatNotificationDialog';
import { ChatStickyHeader } from '@/features/chat/components/ChatStickyHeader';
import { Title } from '@/features/chat/components/Title';
import { useChatAnnouncementDelay } from '@/features/chat/hooks/useChatAnnouncementDelay';
import { useChatSubmit } from '@/features/chat/hooks/useChatSubmit';
import { useChatTitle } from '@/features/chat/hooks/useChatTitle';
import { useReset } from '@/features/chat/hooks/useReset';
import { useSetDefaultValues } from '@/features/chat/hooks/useSetDefaultValues';
import { useChatStore } from '@/features/chat/stores/useChatStore';
import { TOP_CHAT_SYSTEM_PROMPT, TOP_CHAT_SYSTEM_PROMPT_TITLE } from '@/features/landing/constants';
import { useChat } from '@/hooks/useChat';
import { useFollow } from '@/hooks/useFollow';
import { useLiveStatusMessage } from '@/hooks/useLiveStatusMessage';
import { useScreen } from '@/hooks/useScreen';
import { useSystemContext } from './hooks/useSystemContext';

export const ChatPage = () => {
  const {
    setContent,
    setInputSystemContext,
    setSystemContextTitle,
    shouldAutoSubmit,
    setHasSent,
  } = useChatStore();

  const { pathname, search, state } = useLocation();
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { scrollTopAnchorRef, scrollBottomAnchorRef } = useScreen({
    useWindowScroll: true,
  });

  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);
  const { systemContextList } = useSystemContext();

  const {
    loading,
    loadingMessages,
    isEmpty,
    messages,
    clear,
    postChat,
    updateSystemContext,
    getCurrentSystemContext,
    retryGeneration,
    chatTitle,
  } = useChat(pathname, chatId);

  const { scrollableContainer, setFollowing } = useFollow();

  useReset();

  // 履歴を持つチャットのメッセージ読み込み完了時に最下部へスクロール
  useEffect(() => {
    if (chatId && !loadingMessages && !isEmpty) {
      setFollowing(true);
    }
  }, [chatId, loadingMessages, isEmpty, setFollowing]);

  // 画面遷移時に出力が残る問題の対応
  // メッセージが空の時はテキストをクリア（自動送信時・クエリパラメータ指定時は除く）
  useEffect(() => {
    if (messages.length === 0 && !shouldAutoSubmit && search === '') {
      setContent('');
    }
  }, [messages, setContent, shouldAutoSubmit, search]);

  const { title } = useChatTitle(chatTitle);

  useSetDefaultValues(systemContextList);

  const currentSystemContext = getCurrentSystemContext();
  const defaultSystemContext = currentSystemContext || TOP_CHAT_SYSTEM_PROMPT;

  const { onSend, onRetry } = useChatSubmit({
    pathname,
    postChat,
    retryGeneration,
    updateSystemContext,
    getCurrentSystemContext,
    loading,
    setFollowing,
  });

  const onReset = useCallback(() => {
    clear();
    setContent('');
    updateSystemContext(TOP_CHAT_SYSTEM_PROMPT);
    setInputSystemContext(TOP_CHAT_SYSTEM_PROMPT);
    setSystemContextTitle(TOP_CHAT_SYSTEM_PROMPT_TITLE);
    setHasSent(false);
  }, [
    clear,
    updateSystemContext,
    setInputSystemContext,
    setSystemContextTitle,
    setHasSent,
    setContent,
  ]);

  const onNewChat = useCallback(() => {
    onReset();
    navigate('/chat', {
      state: {
        shouldReset: true,
        systemContext: TOP_CHAT_SYSTEM_PROMPT,
        systemContextTitle: TOP_CHAT_SYSTEM_PROMPT_TITLE,
      },
    });
    document.getElementById('window-title')?.focus();
  }, [navigate, onReset]);

  useEffect(() => {
    // URLにクエリパラメータがある場合は useSetDefaultValues に任せる
    if (search !== '') {
      return;
    }
    // state に systemContext が含まれる場合は useSetDefaultValues に任せる（トップチャットからの遷移等）
    if (state?.systemContext) {
      return;
    }
    setInputSystemContext(defaultSystemContext);
  }, [defaultSystemContext, setInputSystemContext, search, state]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const { announcementDelay } = useChatAnnouncementDelay({
    isFromTopChat: !!state?.autoSubmit,
    loading,
    isEmpty,
  });

  const { liveStatusMessage } = useLiveStatusMessage({
    active: lastMessage?.role === 'assistant' || loading,
    loading: loading,
    startDelay: announcementDelay,
    messages: {
      loading: 'AIが回答を生成しています...',
      loadingContinue: 'AIが引き続き回答を生成しています...',
      completed: lastMessage?.content
        ? `AIの回答：${lastMessage.content}`
        : 'AIの回答がありません。',
    },
  });

  return (
    <>
      <PageTitle title={`${title}${APP_TITLE ? ` | ${APP_TITLE}` : ''}`} />
      <div
        className='relative mx-auto grid grid-cols-1 grid-rows-[auto_1fr] max-w-(--page-width) min-h-[calc(100vh-var(--header-height))] pt-6 px-6 lg:px-8 lg:pt-8'
      >
        <div className='lg:mb-3.5'>
          <BreadcrumbsNav
            items={
              chatId
                ? [
                    { label: 'ホーム', to: '/' },
                    { label: 'チャット', to: '/chat' },
                    { label: title },
                  ]
                : [{ label: 'ホーム', to: '/' }, { label: 'チャット' }]
            }
            className='mb-4'
          />
          <div className='flex flex-wrap min-h-[calc(38/16*1rem)] justify-between items-start gap-x-2 gap-y-4'>
            <Title title={title} />
            {!isEmpty && !loadingMessages && (
              <Button
                variant='solid-fill'
                size='md'
                className='-mt-1 text-nowrap lg:hidden'
                onClick={onNewChat}
              >
                新規チャット
              </Button>
            )}
          </div>
        </div>

        <div className='flex justify-between gap-10 xl:gap-16'>
          <div className='flex min-w-0 flex-1 max-w-[calc(1056/16*1rem)] flex-col'>
            <ChatStickyHeader
              title={title}
              onOpenNotificationDialog={() => setIsNotificationDialogOpen(true)}
            />

            <div className='flex-1 py-4 px-2 lg:pb-6'>
              <div ref={scrollTopAnchorRef} />

              {loadingMessages && (
                <div className='relative grid min-h-[50vh] w-full place-content-center'>
                  <ProgressIndicator isLarge={true} label='読み込み中...' />
                </div>
              )}

              {isEmpty && !loadingMessages && (
                <div className='grid min-h-full w-full place-content-center py-4'>
                  <ChatHints />
                </div>
              )}

              <div ref={scrollableContainer} className='flex flex-col gap-4'>
                {!isEmpty &&
                  messages.map((chat, idx) => (
                    <ChatMessage
                      key={chat.messageId ?? `message-${idx}`}
                      chatContent={chat}
                      loading={loading && idx === messages.length - 1}
                      allowRetry={idx === messages.length - 1}
                      retryGeneration={onRetry}
                    />
                  ))}
              </div>

              <div ref={scrollBottomAnchorRef} />
            </div>

            <div className='sticky bottom-0 z-1'>
              <ChatInput onSend={onSend} fileUpload={false} accept={[]} />
            </div>
          </div>
        </div>
      </div>

      <div aria-live='assertive' aria-atomic='true' className='sr-only'>
        {liveStatusMessage}
      </div>

      <ChatNotificationDialog
        isOpen={isNotificationDialogOpen}
        onClose={() => setIsNotificationDialogOpen(false)}
      />
    </>
  );
};
