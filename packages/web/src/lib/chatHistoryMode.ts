export type ChatHistoryMode = 'enabled' | 'disabled';

const getChatHistoryMode = (): ChatHistoryMode => {
  const mode = import.meta.env.VITE_APP_CHAT_HISTORY_MODE?.trim().toLowerCase();
  return mode === 'disabled' ? 'disabled' : 'enabled';
};

export const CHAT_HISTORY_MODE = getChatHistoryMode();
export const isChatHistoryDisabled = CHAT_HISTORY_MODE === 'disabled';
export const isChatHistoryEnabled = !isChatHistoryDisabled;
