import type { RouteObject } from 'react-router';
import { ChatPage } from '@/features/chat/ChatPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFound } from '@/NotFound';
import { Layout } from './layout/Layout';
import { AuthErrorPage } from './pages/AuthErrorPage';
import { SignedOutPage } from './pages/SignedOutPage';

export const createRoutes = (): RouteObject[] => {
  return [
    {
      path: '/signed-out',
      element: <SignedOutPage />,
    },
    {
      path: '/auth-error',
      element: <AuthErrorPage />,
    },
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <LandingPage /> },
        {
          path: 'chat',
          element: <ChatPage />,
        },
        {
          path: 'chat/:chatId',
          element: <ChatPage />,
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ];
};
