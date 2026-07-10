import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import AuthBackground from '../components/AuthBackground';

const QUOTES = [
  'One question today, one expert tomorrow.',
  'Knowledge grows one answer at a time.',
  'Learn. Practice. Master.',
  'Every expert started with a single question.',
  "Debugging your interview nerves, one rep at a time.",
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#123249] to-[#0ea5e9] px-4">
      <AuthBackground />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-3xl mb-3">
            🧠
          </div>
          <h1 className="text-2xl font-semibold text-white">TechPrep Hub</h1>
          <p className="text-sm text-white/70 mt-1 italic">"{quote}"</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-8">
          <p className="text-sm text-white/80 mb-5">Sign in to continue</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-white/90">Username</label>
              <input
                className="w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white/90">Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-white/60"
                iconClassName="text-white/70 hover:text-white"
              />
            </div>
            {error && <p className="text-sm text-red-200 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-brand-700 hover:bg-white/90 disabled:opacity-60 rounded-lg py-2 text-sm font-semibold transition-all"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="flex justify-between mt-4 text-sm">
            <Link to="/forgot-password" className="text-white/80 hover:text-white hover:underline">
              Forgot password?
            </Link>
            <Link to="/register" className="text-white/80 hover:text-white hover:underline">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
