import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import PasswordInput from '../components/PasswordInput';
import AuthBackground from '../components/AuthBackground';

const CUSTOM_OPTION = '__custom__';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', email: '' });
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/security-question-templates').then((res) => setTemplates(res.templates)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!templateId) {
      setError('Choose a security question.');
      return;
    }
    setLoading(true);
    try {
      const securityQuestion =
        templateId === CUSTOM_OPTION ? { customQuestion, answer } : { templateId, answer };
      await register({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        securityQuestion,
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60';
  const labelClass = 'block text-sm font-medium mb-1 text-white/90';

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#123249] to-[#0ea5e9] px-4 py-10">
      <AuthBackground />

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-3xl mb-3">
            🧠
          </div>
          <h1 className="text-2xl font-semibold text-white">TechPrep Hub</h1>
          <p className="text-sm text-white/70 mt-1">Join in, one question at a time.</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">Create your account</h2>
          <p className="text-sm text-white/70 mb-6">
            Password resets use your security question only — no email required.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Username</label>
                <input
                  className={inputClass}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Email (optional)</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Password</label>
                <PasswordInput
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  required
                  className={`${inputClass} pr-10`}
                  iconClassName="text-white/70 hover:text-white"
                />
                <p className="text-xs text-white/50 mt-1">Min 8 characters, at least one letter and one number.</p>
              </div>
              <div>
                <label className={labelClass}>Confirm Password</label>
                <PasswordInput
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  autoComplete="new-password"
                  required
                  className={`${inputClass} pr-10`}
                  iconClassName="text-white/70 hover:text-white"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Security Question</label>
              <select
                className={inputClass}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                <option value="" disabled className="text-gray-800">
                  Choose a security question…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id} className="text-gray-800">
                    {t.question}
                  </option>
                ))}
                <option value={CUSTOM_OPTION} className="text-gray-800">
                  Custom Question…
                </option>
              </select>
            </div>

            {templateId === CUSTOM_OPTION && (
              <div>
                <label className={labelClass}>Your Question</label>
                <input
                  className={inputClass}
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="e.g. What was the name of my first pet?"
                  required
                />
              </div>
            )}

            {templateId && (
              <div>
                <label className={labelClass}>Answer</label>
                <input
                  className={inputClass}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-red-200 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-brand-700 hover:bg-white/90 disabled:opacity-60 rounded-lg py-2 text-sm font-semibold transition-all"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-sm mt-4 text-white/80">
            Already have an account?{' '}
            <Link to="/login" className="text-white hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
