import { Authenticator, translations, useAuthenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import { type SignInInput, signIn } from 'aws-amplify/auth';
import { I18n } from 'aws-amplify/utils';
import React, { useEffect, useRef } from 'react';
import { APP_TITLE } from '@/constants';
import {
  KAIGO_LOGIN_DESCRIPTION,
  KAIGO_LOGIN_NOTES,
  KAIGO_SERVICE_NAME,
} from '@/features/kaigo/constants';
import { PageTitle } from '../PageTitle';

const selfSignUpEnabled: boolean = import.meta.env.VITE_APP_SELF_SIGN_UP_ENABLED === 'true';

type Props = {
  children: React.ReactNode;
};

const AuthWithUserpoolContent = (props: Props) => {
  const { children } = props;

  const { route } = useAuthenticator((context) => [context.route]);
  const prevRoute = useRef<string | undefined>(undefined);

  const savedPasswordRef = useRef<string | undefined>(undefined);
  const services = {
    handleSignIn: (input: SignInInput) => {
      if (input.password) {
        savedPasswordRef.current = input.password;
      }

      if (!input.password && savedPasswordRef.current) {
        const { options: _options, ...rest } = input;
        return signIn({ ...rest, password: savedPasswordRef.current });
      }

      return signIn(input);
    },
  };

  useEffect(() => {
    // 初期表示やサインアップとのタブ切り替えの際はフォーカスは移動させないために除外条件を設定
    const isIgnoredTransition =
      !prevRoute.current ||
      prevRoute.current === 'idle' ||
      prevRoute.current === 'setup' ||
      prevRoute.current === 'signUp';

    if (route === 'signIn' && !isIgnoredTransition && prevRoute.current !== 'signIn') {
      // 他画面からサインイン画面に戻ってきた場合のみフォーカス
      const title = document.getElementById('auth-sign-in-header');
      title?.focus();
      window.scrollTo(0, 0);
    }
    prevRoute.current = route;
  }, [route]);

  // サインアウト後のページは認証不要でレンダリング
  if (window.location.pathname === '/signed-out') {
    return <>{children}</>;
  }

  return (
    <Authenticator
      hideSignUp={!selfSignUpEnabled}
      services={services}
      components={{
        Header: () => {
          return (
            <>
              <PageTitle title={`サインイン${APP_TITLE ? ` | ${APP_TITLE}` : ''}`} />
              <h1 className='mt-8 mb-3 flex justify-center px-8 text-center text-std-32B-150 text-solid-gray-900'>
                {KAIGO_SERVICE_NAME}
              </h1>
              <div className='mx-8 mb-6 rounded-8 border border-solid-gray-420 bg-solid-gray-50 p-4 text-std-16N-170 text-solid-gray-800'>
                <p>{KAIGO_LOGIN_DESCRIPTION}</p>
                <p className='mt-3 font-700'>配布されたID・パスワードでログインしてください。</p>
                <p className='mt-3 font-700'>ご利用にあたっての注意：</p>
                <ul className='mt-2 list-disc space-y-1 pl-6'>
                  {KAIGO_LOGIN_NOTES.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </>
          );
        },
        SignIn: {
          Header() {
            return (
              <>
                <h2
                  id='auth-sign-in-header'
                  tabIndex={-1}
                  className='mx-8 mt-8 text-std-24B-150 text-solid-gray-800 focus-visible:rounded-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:outline-solid'
                >
                  ログイン
                </h2>
                <p className='mx-8 mt-2 text-std-16N-170 text-solid-gray-700'>
                  配布されたIDとパスワードを入力してください。
                </p>
              </>
            );
          },
        },
        SignUp: {
          Header() {
            return (
              <h2 className='mx-8 mt-8 text-std-24B-150 text-solid-gray-800 focus-visible:rounded-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:outline-solid'>
                アカウントを作る
              </h2>
            );
          },
        },
        ForgotPassword: {
          Header() {
            const ref = useRef<HTMLHeadingElement>(null);

            useEffect(() => {
              ref.current?.focus();
            }, []);
            return (
              <>
                <h2
                  ref={ref}
                  tabIndex={-1}
                  className='text-std-24B-150 text-solid-gray-800 focus-visible:rounded-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:outline-solid'
                >
                  パスワードを再設定
                </h2>
                <p className='mb-2 text-solid-gray-700'>
                  登録しているメールアドレスを入力してください。確認コードを送信します
                </p>
              </>
            );
          },
        },
        ConfirmResetPassword: {
          Header() {
            const ref = useRef<HTMLHeadingElement>(null);

            useEffect(() => {
              ref.current?.focus();
            }, []);
            return (
              <>
                <h2
                  ref={ref}
                  tabIndex={-1}
                  className='text-std-24B-150 text-solid-gray-800 focus-visible:rounded-4 focus-visible:bg-yellow-300 focus-visible:ring-[calc(2/16*1rem)] focus-visible:ring-yellow-300 focus-visible:outline-4 focus-visible:outline-offset-[calc(2/16*1rem)] focus-visible:outline-black focus-visible:outline-solid'
                >
                  パスワードを再設定
                </h2>
                <p className='mb-2 text-solid-gray-800'>
                  登録しているメールアドレスに送信された6桁の確認コードを入力し、新しいパスワードを設定してください
                </p>
              </>
            );
          },
        },
      }}
      formFields={{
        signIn: {
          username: {
            label: 'ID',
            placeholder: '',
          },
          password: {
            label: 'パスワード',
            placeholder: '',
          },
        },
        forgotPassword: {
          username: {
            placeholder: '',
          },
        },
        confirmResetPassword: {
          confirmation_code: {
            placeholder: '',
          },
          password: {
            placeholder: '',
          },
          confirm_password: {
            placeholder: '',
          },
        },
      }}
    >
      {children}
    </Authenticator>
  );
};

export const AuthWithUserpool = (props: Props) => {
  const { children } = props;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_APP_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_APP_USER_POOL_CLIENT_ID,
        identityPoolId: import.meta.env.VITE_APP_IDENTITY_POOL_ID,
      },
    },
  });

  I18n.putVocabularies(translations);
  I18n.setLanguage('ja');

  I18n.putVocabularies({
    ja: {
      Username: 'ID',
      'Password cannot be empty': 'パスワードは必須入力です',
      'password is required to signIn': 'パスワードは必須です',
      'User does not exist.': 'ユーザー名またはパスワードが違います',
      'Incorrect username or password.': 'ユーザー名またはパスワードが違います',
      'username is required to signIn': 'IDは必須です',
      'Username cannot be empty': 'IDは必須です',
      'username is required to resetPassword': 'IDは必須です',
      'Username/client id combination not found.': 'IDが登録されていません',
      'confirmationCode is required to confirmResetPassword': '確認コードは必須です',
      'newPassword is required to confirmResetPassword': '新しいパスワードは必須です',
      'Invalid verification code provided, please try again.':
        '無効な確認コードです。もう一度お試しください。',
      'Your passwords must match': 'パスワードが一致していません',
      'Password must have at least 8 characters': 'パスワードは8文字以上である必要があります',
      'Password does not conform to policy: Password not long enough':
        'パスワードは8文字以上を入力してください (8文字以上の大文字小文字を含む英数字)',
      'Password does not conform to policy: Password must have uppercase characters':
        'パスワードには大文字を含めてください (8文字以上の大文字小文字を含む英数字)',
      'Password does not conform to policy: Password must have lowercase characters':
        'パスワードには小文字を含めてください (8文字以上の大文字小文字を含む英数字)',
      'Password does not conform to policy: Password must have numeric characters':
        'パスワードには数字を含めてください (8文字以上の大文字小文字を含む英数字)',
      'Password does not conform to policy: Password must have symbol characters':
        'パスワードには記号を含めてください (8文字以上の大文字小文字を含む英数字)',
      "1 validation error detected: Value at 'password' failed to satisfy constraint: Member must have length greater than or equal to 6":
        'パスワードは8文字以上、大文字小文字を含む英数字を指定してください',
      'Attempt limit exceeded, please try after some time.':
        '試行回数の上限を超えました。しばらくしてから再度お試しください。',
      // MFA 関連
      'Confirm MFA Code': '認証コードの確認',
      Code: '認証コード',
      Confirm: '確認',
      'Code *': '認証コード *',
      'Please confirm your Code': '認証コードを入力してください',
      'Invalid code or auth state for the user.': '認証コードが無効です。もう一度お試しください。',
      'Code mismatch': '認証コードが一致しません',
      'Invalid session for the user, session is expired.':
        'セッションが期限切れです。もう一度サインインしてください。',
      'The verification code you entered is incorrect. Please try again.':
        '入力された確認コードが正しくありません。もう一度お試しください。',
      'An error occurred during the sign in process. This most likely occurred due to: 1. signIn was not called before confirmSignIn. 2. signIn threw an exception. 3. page was refreshed during the sign in flow and session has expired.':
        'サインインのセッションが無効になりました。ページを再読み込みして、もう一度サインインしてください。',
      '\n\t\t\tAn error occurred during the sign in process.\n\n\t\t\tThis most likely occurred due to:\n\t\t\t1. signIn was not called before confirmSignIn.\n\t\t\t2. signIn threw an exception.\n\t\t\t3. page was refreshed during the sign in flow and session has expired.\n\t\t\t':
        'サインインのセッションが無効になりました。ページを再読み込みして、もう一度サインインしてください。',
    },
  });

  return (
    <Authenticator.Provider>
      <AuthWithUserpoolContent>{children}</AuthWithUserpoolContent>
    </Authenticator.Provider>
  );
};
