import { PiLightbulbFilamentBold } from 'react-icons/pi';
import {
  KAIGO_EXAMPLE_PROMPT_CATEGORIES,
  KAIGO_EXAMPLE_PROMPTS,
  KAIGO_PROHIBITED_INPUT_TEXT,
  KAIGO_SERVICE_NAME,
} from '@/features/kaigo/constants';

export const ChatHints = () => {
  return (
    <div className='max-w-full overflow-hidden rounded-16 border border-solid-gray-536 bg-solid-gray-50 px-6 py-5 text-solid-gray-800 xl:px-8 xl:py-6'>
      <h2 className='mb-4 flex items-center text-std-18B-160'>
        <PiLightbulbFilamentBold className='mr-2 size-6' />
        {KAIGO_SERVICE_NAME}への相談例
      </h2>
      <ul className='space-y-3 text-std-16N-170'>
        {KAIGO_EXAMPLE_PROMPTS.map((example, index) => (
          <li key={example}>
            <p className='break-words text-std-16B-170 [overflow-wrap:anywhere]'>
              {KAIGO_EXAMPLE_PROMPT_CATEGORIES[index]}
            </p>
            <p className='mt-1 whitespace-pre-line break-words [overflow-wrap:anywhere]'>
              {example}
            </p>
          </li>
        ))}
      </ul>
      <div className='mt-5 border-t border-solid-gray-420 pt-4'>
        <h3 className='mb-2 text-std-16B-170'>入力してはいけないこと</h3>
        <p className='break-words text-std-16N-170 [overflow-wrap:anywhere]'>
          {KAIGO_PROHIBITED_INPUT_TEXT}
        </p>
      </div>
    </div>
  );
};
