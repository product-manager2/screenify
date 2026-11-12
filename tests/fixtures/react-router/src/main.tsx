import { createBrowserRouter } from 'react-router-dom';
import Layout from './routes/Layout';
import Inbox from './routes/Inbox';
import { Settings } from './routes/Settings';
const Profile = lazy(() => import('./routes/Profile'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Inbox /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/profile', element: <Profile /> },
      { path: 'reports', lazy: () => import('./routes/Reports') },
    ],
  },
]);
