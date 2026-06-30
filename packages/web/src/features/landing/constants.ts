import { KAIGO_SERVICE_NAME, KAIGO_SYSTEM_PROMPT } from '@/features/kaigo/constants';

const topChatSystemPrompt = import.meta.env.VITE_APP_TOP_CHAT_SYSTEM_PROMPT?.trim();
const topChatSystemPromptTitle = import.meta.env.VITE_APP_TOP_CHAT_SYSTEM_PROMPT_TITLE?.trim();

export const TOP_CHAT_SYSTEM_PROMPT = topChatSystemPrompt || KAIGO_SYSTEM_PROMPT;
export const TOP_CHAT_SYSTEM_PROMPT_TITLE = topChatSystemPromptTitle || KAIGO_SERVICE_NAME;
