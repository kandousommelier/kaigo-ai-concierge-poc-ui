import { FindChatByIdResponse, ListChatsResponse, ListMessagesResponse } from 'genai-web';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import {
  createChat,
  createMessages,
  deleteChat,
  predict,
  predictStream,
  predictTitle,
  updateTitle,
} from '@/lib/chatApi';
import { genUApiFetcher } from '@/lib/fetcher';
import { isChatHistoryDisabled } from '@/lib/chatHistoryMode';

export const useChatApi = () => {
  return {
    createChat,
    createMessages,
    deleteChat,
    listChats: () => {
      const getKey = (pageIndex: number, previousPageData: ListChatsResponse) => {
        if (isChatHistoryDisabled) {
          return null;
        }

        if (previousPageData && !previousPageData.lastEvaluatedKey) {
          return null;
        }

        if (pageIndex === 0) {
          return 'chats';
        }

        return `chats?exclusiveStartKey=${previousPageData.lastEvaluatedKey}`;
      };

      return useSWRInfinite<ListChatsResponse>(getKey, genUApiFetcher, {
        revalidateIfStale: false,
      });
    },
    findChatById: (chatId?: string) => {
      const key = chatId && !isChatHistoryDisabled ? `chats/${chatId}` : null;
      return useSWR<FindChatByIdResponse>(key, genUApiFetcher);
    },
    listMessages: (chatId?: string) => {
      const key = chatId && !isChatHistoryDisabled ? `chats/${chatId}/messages` : null;
      return useSWR<ListMessagesResponse>(key, genUApiFetcher);
    },
    updateTitle,
    predict,
    predictStream,
    predictTitle,
  };
};
