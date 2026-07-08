import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const EMPTY_QUESTIONS = [
  { question: '', answer: '' },
  { question: '', answer: '' },
  { question: '', answer: '' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', email: '' });
  const [securityQuestions, setSecurityQuestions] = useState(EMPTY_QUESTIONS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateQuestion = (idx, field, value) => {
    setSecurityQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const addQuestion = () => {
    if (securityQuestions.length < 5) setSecurityQuestions((prev) => [...prev, { question: '', answer: '' }]);
  };

  const removeQuestion = (idx) => {
    if (securityQuestions.length > 3) setSecurityQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        securityQuestions,
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8 border border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold mb-1">Create your account</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Password resets use security questions only — no email required.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email (optional)</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <p className="text-xs text-gray-500 mt-1">Min 8 characters, at least one letter and one number.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm Password</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Security Questions (3-5)</label>
              {securityQuestions.length < 5 && (
                <button type="button" onClick={addQuestion} className="text-xs text-brand-600 hover:underline">
                  + Add question
                </button>
              )}
            </div>
            <div className="space-y-2">
              {securityQuestions.map((q, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                  <input
                    className="col-span-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                    placeholder={`Security question ${idx + 1}`}
                    value={q.question}
                    onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                    required
                  />
                  <input
                    className="col-span-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                    placeholder="Answer"
                    value={q.answer}
                    onChange={(e) => updateQuestion(idx, 'answer', e.target.value)}
                    required
                  />
                  {securityQuestions.length > 3 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      className="col-span-5 text-xs text-red-500 text-right hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
