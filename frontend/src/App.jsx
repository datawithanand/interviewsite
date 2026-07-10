import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, isContentManagerOrAdmin } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Layout from './components/Layout';
import QuestionsView from './pages/QuestionsView';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import Progress from './pages/Progress';
import Practice from './pages/Practice';
import MockInterview from './pages/MockInterview';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdminPanelAccess({ children }) {
  const { user } = useAuth();
  if (!isContentManagerOrAdmin(user)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<QuestionsView />} />
        <Route path="nodes/:nodeId" element={<QuestionsView />} />
        <Route path="profile" element={<Profile />} />
        <Route path="progress" element={<Progress />} />
        <Route path="practice" element={<Practice />} />
        <Route path="mock-interview" element={<MockInterview />} />
        <Route
          path="admin"
          element={
            <RequireAdminPanelAccess>
              <AdminPanel />
            </RequireAdminPanelAccess>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
