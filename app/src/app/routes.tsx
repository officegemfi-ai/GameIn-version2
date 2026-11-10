import type { ComponentType } from 'react';
import { Outlet, ScrollRestoration, type RouteObject } from 'react-router';
import { AdaptiveShell, AppShell } from '@/components/layout/AppShell';
import { PublicShell } from '@/components/layout/PublicShell';
import { NotFoundPage, RouteError } from '@/components/layout/Errors';
import { Loading } from '@/components/ui/Feedback';
import { RequireAuth, RequireSeat, SignedOutOnly } from './guards';
import { startOverFor } from './startOver';

// Each screen is its own chunk, loaded when first visited. `about` names the part of the address that says which
// offer, deal or creator a screen is about: such a screen starts over for each one (startOver.tsx).
const page = (load: () => Promise<{ default: ComponentType }>, about?: string) => ({
  lazy: async () => {
    const Page = (await load()).default;
    return { Component: about ? startOverFor(Page, about) : Page };
  },
});

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RouteError />,
    // shown on first load while the screen's code arrives
    hydrateFallbackElement: <Loading />,
    children: [
      // public, signed out
      {
        element: <SignedOutOnly />,
        children: [
          {
            element: <PublicShell />,
            children: [
              { index: true, ...page(() => import('@/features/landing/LandingPage')) },
              { path: 'sign-in', ...page(() => import('@/features/auth/SignInPage')) },
              { path: 'sign-up', ...page(() => import('@/features/auth/SignUpPage')) },
              { path: 'forgot-password', ...page(() => import('@/features/auth/ForgotPasswordPage')) },
            ],
          },
        ],
      },
      // from a password-reset email (the link signs the person in for this)
      { element: <PublicShell />, children: [{ path: 'reset-password', ...page(() => import('@/features/auth/ResetPasswordPage')) }] },
      // creator pages are public; signed in, they show inside the app
      { element: <AdaptiveShell />, children: [{ path: 'c/:handle', ...page(() => import('@/features/creators/CreatorPage'), 'handle') }] },
      // signed in
      {
        element: <RequireAuth />,
        children: [
          { element: <AdaptiveShell />, children: [{ path: 'onboarding', ...page(() => import('@/features/onboarding/OnboardingPage')) }] },
          {
            element: <RequireSeat />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: 'dashboard', ...page(() => import('@/features/dashboard/DashboardPage')) },
                  { path: 'discover', ...page(() => import('@/features/creators/DiscoverPage')) },
                  { path: 'offers', ...page(() => import('@/features/offers/OffersPage')) },
                  { path: 'offers/new', ...page(() => import('@/features/offers/NewOfferPage')) },
                  { path: 'offers/:id', ...page(() => import('@/features/offers/OfferPage'), 'id') },
                  { path: 'deals', ...page(() => import('@/features/deals/DealsPage')) },
                  { path: 'deals/:id', ...page(() => import('@/features/deals/DealPage'), 'id') },
                  { path: 'proofs/:id', ...page(() => import('@/features/deals/ProofRedirect')) },
                  // one screen for the list and the open conversation: the list stays put from one conversation to the
                  // next, and what's typed is kept per conversation instead (lib/drafts.ts)
                  { path: 'messages', ...page(() => import('@/features/messages/MessagesPage')) },
                  { path: 'messages/:id', ...page(() => import('@/features/messages/MessagesPage')) },
                  { path: 'packages', ...page(() => import('@/features/packages/PackagesPage')) },
                  { path: 'wallet', ...page(() => import('@/features/wallet/WalletPage')) },
                  { path: 'payments', ...page(() => import('@/features/payments/PaymentsPage')) },
                  { path: 'settings', ...page(() => import('@/features/settings/SettingsPage')) },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
