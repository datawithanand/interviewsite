import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import PasswordInput from '../components/PasswordInput';
import AuthBackground from '../components/AuthBackground';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startReset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/auth/forgot-password/start', { username });
      setQuestion(res.question);
      setStep(2);
    } catch (err) {
      // Backend returns a distinct "User not found." for a nonexistent
      // username per product requirement (a conscious enumeration trade-off).
      setError(err.message);
    }
  };

  const verifyAndReset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/forgot-password/verify', { username, answer, newPassword });
      setSuccess('Password reset successfully. You can now sign in.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60';
  const labelClass = 'block text-sm font-medium mb-1 text-white/90';

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#123249] to-[#0ea5e9] px-4">
      <AuthBackground />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-3xl mb-3">
            🧠
          </div>
          <h1 className="text-2xl font-semibold text-white">InterviewIQ</h1>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">Reset your password</h2>
          <p className="text-sm text-white/70 mb-6">Answer your security question to continue.</p>

          {step === 1 && (
            <form onSubmit={startReset} className="space-y-4">
              <div>
                <label className={labelClass}>Username</label>
                <input
                  className={inputClass}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-200 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <button
                type="submit"
                className="w-full bg-white text-brand-700 hover:bg-white/90 rounded-lg py-2 text-sm font-semibold transition-all"
              >
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyAndReset} className="space-y-4">
              <div>
                <label className={labelClass}>{question}</label>
                <input className={inputClass} value={answer} onChange={(e) => setAnswer(e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={`${inputClass} pr-10`}
                  iconClassName="text-white/70 hover:text-white"
                />
              </div>
              {error && <p className="text-sm text-red-200 bg-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-sm text-emerald-200 bg-emerald-500/20 rounded-lg px-3 py-2">{success}</p>}
              <button
                type="submit"
                className="w-full bg-white text-brand-700 hover:bg-white/90 rounded-lg py-2 text-sm font-semibold transition-all"
              >
                Reset password
              </button>
            </form>
          )}

          <p className="text-sm mt-4 text-white/80">
            <Link to="/login" className="text-white hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
