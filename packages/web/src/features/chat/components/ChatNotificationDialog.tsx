import {
  CustomDialog,
  CustomDialogBody,
  CustomDialogHeader,
  CustomDialogPanel,
} from '@/components/ui/CustomDialog';
import { Button } from '@/components/ui/dads/Button';
import { List } from '@/components/ui/dads/List';
import {
  KAIGO_ANSWER_POSITION_TEXT,
  KAIGO_INTENDED_USE_TEXT,
  KAIGO_LOGIN_NOTES,
  KAIGO_PROHIBITED_INPUT_TEXT,
  KAIGO_SERVICE_NAME,
  KAIGO_TOP_DESCRIPTION,
} from '@/features/kaigo/constants';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const ChatNotificationDialog = (props: Props) => {
  const { isOpen, onClose } = props;

  return (
    <CustomDialog isOpen={isOpen} onClose={onClose} position='top'>
      <CustomDialogPanel className='max-w-3xl!'>
        <CustomDialogHeader onClose={onClose} hasClose>
          ご利用にあたっての注意
        </CustomDialogHeader>
        <CustomDialogBody>
          <div className='flex flex-col gap-4'>
            <p>
              {KAIGO_SERVICE_NAME}は、
              {KAIGO_TOP_DESCRIPTION.replace('介護現場AIコンシェルジュは、', '')}
            </p>
            <div>
              <h3 className='mb-2 text-std-20B-150'>利用目的</h3>
              <p>{KAIGO_INTENDED_USE_TEXT}</p>
            </div>
            <div>
              <h3 className='mb-2 text-std-20B-150'>入力してはいけないこと</h3>
              <p>{KAIGO_PROHIBITED_INPUT_TEXT}</p>
              <p className='mt-2'>
                個別ケースではなく、個人が特定されない業務上の困りごととして相談してください。
              </p>
            </div>
            <div>
              <h3 className='mb-2 text-std-20B-150'>回答の位置づけ</h3>
              <p>{KAIGO_ANSWER_POSITION_TEXT}</p>
            </div>
            <div>
              <h3 className='mb-2 text-std-20B-150'>ログイン情報の扱い</h3>
              <List spacing='4'>
                {KAIGO_LOGIN_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </List>
            </div>
          </div>
        </CustomDialogBody>
        <div className='mt-6 flex justify-center'>
          <Button type='button' size='lg' variant='solid-fill' onClick={onClose}>
            確認しました
          </Button>
        </div>
      </CustomDialogPanel>
    </CustomDialog>
  );
};
