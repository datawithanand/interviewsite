import { useEffect, useState } from 'react';
import { api } from '../api/client';
import SessionsPanel from '../components/SessionsPanel';
import PasswordInput from '../components/PasswordInput';

const ROLE_LABELS = { REGULAR_USER: 'Regular User', CONTENT_MANAGER: 'Content Manager', ADMIN: 'Admin' };
const CUSTOM_OPTION = '__custom__';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [templates, setTemplates] = useState([]);
  const [sqTemplateId, setSqTemplateId] = useState('');
  const [sqCustomQuestion, setSqCustomQuestion] = useState('');
  const [sqAnswer, setSqAnswer] = useState('');
  const [sqMessage, setSqMessage] = useState('');
  const [sqError, setSqError] = useState('');

  useEffect(() => {
    api
      .get('/profile')
      .then((res) => {
        setProfile(res.user);
        setEmail(res.user.email || '');
        setBio(res.user.bio || '');
      })
      .catch((err) => setError(err.message));
    api.get('/security-question-templates').then((res) => setTemplates(res.templates)).catch(() => {});
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.patch('/profile', { email: email || null, bio: bio || null });
      setMessage('Profile updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/profile/change-password', { currentPassword, newPassword });
      setMessage('Password updated. You have been signed out of other devices.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const saveSecurityQuestion = async (e) => {
    e.preventDefault();
    setSqError('');
    setSqMessage('');
    try {
      const payload =
        sqTemplateId === CUSTOM_OPTION ? { customQuestion: sqCustomQuestion, answer: sqAnswer } : { templateId: sqTemplateId, answer: sqAnswer };
      await api.put('/profile/security-question', payload);
      setSqMessage('Security question updated.');
      setSqAnswer('');
      const res = await api.get('/profile');
      setProfile(res.user);
    } catch (err) {
      setSqError(err.message);
    }
  };

  if (!profile) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-xl font-semibold">My Profile</h1>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm space-y-1">
        <p>
          <span className="text-gray-500">Username:</span> {profile.username}
        </p>
        <p>
          <span className="text-gray-500">Role:</span> {ROLE_LABELS[profile.role] || profile.role}
        </p>
        <p>
          <span className="text-gray-500">Questions created:</span> {profile.questionsCreated}
        </p>
        <p>
          <span className="text-gray-500">Joined:</span> {new Date(profile.createdAt).toLocaleDateString()}
        </p>
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={saveProfile} className="space-y-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm">Edit Profile</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm">
          Save
        </button>
      </form>

      <form onSubmit={changePassword} className="space-y-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm">Change Password</h3>
        <div>
          <label className="block text-sm font-medium mb-1">Current Password</label>
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">New Password</label>
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm">
          Update Password
        </button>
      </form>

      <form onSubmit={saveSecurityQuestion} className="space-y-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm">Security Question</h3>
        <p className="text-xs text-gray-500">
          Current: <span className="font-medium">{profile.securityQuestion || 'Not set'}</span>
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">New question</label>
          <select
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            value={sqTemplateId}
            onChange={(e) => setSqTemplateId(e.target.value)}
          >
            <option value="" disabled>
              Choose a security question…
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.question}
              </option>
            ))}
            <option value={CUSTOM_OPTION}>Custom Question…</option>
          </select>
        </div>
        {sqTemplateId === CUSTOM_OPTION && (
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            placeholder="Your question"
            value={sqCustomQuestion}
            onChange={(e) => setSqCustomQuestion(e.target.value)}
            required
          />
        )}
        {sqTemplateId && (
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            placeholder="Answer"
            value={sqAnswer}
            onChange={(e) => setSqAnswer(e.target.value)}
            required
          />
        )}
        {sqMessage && <p className="text-sm text-green-600">{sqMessage}</p>}
        {sqError && <p className="text-sm text-red-600">{sqError}</p>}
        <button type="submit" disabled={!sqTemplateId} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm">
          Update Security Question
        </button>
      </form>

      <SessionsPanel />
    </div>
  );
}
