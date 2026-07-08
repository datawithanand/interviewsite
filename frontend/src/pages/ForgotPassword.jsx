import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startReset = async (e) => {
    e.preventDefault();
    setError('');
    const res = await api.post('/auth/forgot-password/start', { username });
    if (res.questions.length === 0) {
      setError('No security questions found for this username. Contact an administrator.');
      return;
    }
    setQuestions(res.questions);
    setStep(2);
  };

  const verifyAndReset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        username,
        answers: questions.map((q) => ({ id: q.id, answer: answers[q.id] || '' })),
        newPassword,
      };
      await api.post('/auth/forgot-password/verify', payload);
      setSuccess('Password reset successfully. You can now sign in.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8 border border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold mb-1">Reset your password</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Answer your security questions to continue.</p>

        {step === 1 && (
          <form onSubmit={startReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium">
              Continue
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyAndReset} className="space-y-4">
            {questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium mb-1">{q.question}</label>
                <input
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  required
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium mb-1">New Password</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium">
              Reset password
            </button>
          </form>
        )}

        <p className="text-sm mt-4">
          <Link to="/login" className="text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
