import { useRef } from 'react';
import { ChatNotificationDialogButton } from '@/features/chat/components/ChatNotificationDialogButton';
import { useStickyHeader } from '@/features/chat/hooks/useStickyHeader';
import { KAIGO_CHAT_NOTICE } from '@/features/kaigo/constants';

type Props = {
  title: string;
  onOpenNotificationDialog: () => void;
};

export const ChatStickyHeader = (props: Props) => {
  const { title, onOpenNotificationDialog } = props;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const isSticky = useStickyHeader(sentinelRef);

  return (
    <>
      <div ref={sentinelRef} className='h-px' />
      <div
        className={`
        group/sticky pt-2.5 z-1 lg:data-[is-sticky='true']:sticky lg:data-[is-sticky='true']:top-(--header-height) lg:data-[is-sticky='true']:bg-white
      `}
        data-is-sticky={isSticky}
      >
        <div className='min-w-0 shrink-0 flex flex-col gap-2'>
          <div className='flex items-center justify-between flex-wrap gap-y-2 gap-x-4 lg:gap-x-6 lg:group-data-[is-sticky="true"]/sticky:gap-4'>
            <p
              aria-hidden={true}
              className='hidden min-w-0 truncate text-std-16B-170 lg:group-data-[is-sticky="true"]/sticky:block'
            >
              {title}
            </p>
            <ChatNotificationDialogButton className='shrink-0' onClick={onOpenNotificationDialog} />
          </div>
          <div className='break-words border-b border-b-solid-gray-800 pb-2 text-std-14N-160 text-solid-gray-800 [overflow-wrap:anywhere]'>
            {KAIGO_CHAT_NOTICE.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
