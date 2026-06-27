import { PiLightbulbFilamentBold } from 'react-icons/pi';
import {
  KAIGO_EXAMPLE_PROMPTS,
  KAIGO_PROHIBITED_INPUT_TEXT,
  KAIGO_SERVICE_NAME,
} from '@/features/kaigo/constants';

export const ChatHints = () => {
  return (
    <div className='rounded-16 border border-solid-gray-536 bg-solid-gray-50 px-6 py-5 text-solid-gray-800 xl:px-8 xl:py-6'>
      <h2 className='mb-4 flex items-center text-std-18B-160'>
        <PiLightbulbFilamentBold className='mr-2 size-6' />
        {KAIGO_SERVICE_NAME}への相談例
      </h2>
      <ul className='list-disc space-y-2 pl-6 text-std-16N-170'>
        {KAIGO_EXAMPLE_PROMPTS.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
      <div className='mt-5 border-t border-solid-gray-420 pt-4'>
        <h3 className='mb-2 text-std-16B-170'>入力してはいけないこと</h3>
        <p className='text-std-16N-170'>{KAIGO_PROHIBITED_INPUT_TEXT}</p>
      </div>
    </div>
  );
};
