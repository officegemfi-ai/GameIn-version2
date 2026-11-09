import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '@/components/ui';
import { env } from '@/lib/env';
import { createQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { SeatProvider } from '@/features/seats/SeatProvider';
import { routes } from './routes';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes, { basename: env.basePath || '/' });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <SeatProvider>
            <RouterProvider router={router} />
          </SeatProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
