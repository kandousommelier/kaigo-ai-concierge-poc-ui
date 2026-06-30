import { useParams } from 'react-router';
import { useChatList } from '@/hooks/useChatList';
import { isChatHistoryDisabled } from '@/lib/chatHistoryMode';

export const useChatTitle = (chatTitleFromStore?: string) => {
  const { chatId } = useParams();
  const { getChatTitle } = useChatList();

  const canUseSavedTitle = chatId && !isChatHistoryDisabled;
  const pageTitle = canUseSavedTitle ? getChatTitle(chatId) || 'チャット' : 'チャット';
  const title = canUseSavedTitle ? pageTitle : chatTitleFromStore || 'チャット';

  return {
    title,
    pageTitle,
  };
};
