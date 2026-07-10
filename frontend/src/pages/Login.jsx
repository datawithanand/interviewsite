import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-600 via-indigo-600 to-purple-700 px-4">
      {/* Ambient background scene — purely decorative, aria-hidden, never overlaps the card */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 -right-20 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute -bottom-24 left-1/4 w-80 h-80 bg-indigo-300/20 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />

        {/* Faint oversized brace, tucked in a corner as quiet texture rather than dead-center */}
        <div className="absolute -top-10 -right-6 text-[16rem] leading-none opacity-[0.05] select-none font-mono text-white rotate-6">
          {'{ }'}
        </div>

        {/* Easter egg #1: rubber-duck debugging, tucked in the bottom-left corner, well clear of the card */}
        <svg
          className="hidden sm:block absolute bottom-6 left-6 w-20 h-20 md:w-24 md:h-24 text-white/40"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Rubber duck debugging: works every time.</title>
          {/* water ripples */}
          <path d="M8 82c6 3 12 3 18 0s12-3 18 0 12 3 18 0 12-3 18 0" opacity="0.6" />
          <path d="M14 90c5 2.5 10 2.5 15 0s10-2.5 15 0 10 2.5 15 0" opacity="0.35" />
          {/* body */}
          <path d="M28 80c-6-3-10-10-8-18 2-9 10-14 10-24 0-9 7-16 17-16 8 0 14 5 16 12 5 1 9 5 9 11 0 5-3 8-3 8s6 2 6 10c0 12-11 20-11 20s2 3 2 6c0 3-3 5-3 5H30s-2-2-2-5c0-3 0-9 0-9z" />
          {/* wing */}
          <path d="M34 52c4-2 9-1 11 2" opacity="0.7" />
          {/* eye */}
          <circle cx="57" cy="27" r="1.6" fill="currentColor" stroke="none" />
          {/* beak */}
          <path d="M64 30c4 0 7 2 7 4s-3 4-7 4c-2 0-4-1-5-2" />
          {/* tiny thought bubble asking the eternal question */}
          <circle cx="74" cy="12" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
          <circle cx="78" cy="8" r="2" fill="currentColor" stroke="none" opacity="0.7" />
          <text x="73.5" y="9.5" fontSize="5.5" fontFamily="ui-monospace, monospace" fill="currentColor" stroke="none" opacity="0.85">
            ?
          </text>
        </svg>

        {/* Easter egg #2: a terminal quietly encouraging the candidate, tucked top-right below the corner brace */}
        <div className="hidden sm:block absolute top-24 right-6 md:top-28 md:right-10 w-44 md:w-52 rounded-lg border border-white/15 bg-white/5 backdrop-blur-sm overflow-hidden opacity-70">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          </div>
          <div className="px-2.5 py-2 font-mono text-[10px] leading-relaxed text-white/60">
            <p>$ git commit -m "ready"</p>
            <p className="text-white/40">
              you got this
              <span className="inline-block w-1.5 h-3 align-middle ml-0.5 bg-white/50 animate-pulse" />
            </p>
          </div>
        </div>
      </div>

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
