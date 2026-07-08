import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    api.get('/profile').then((res) => {
      setProfile(res.user);
      setEmail(res.user.email || '');
      setBio(res.user.bio || '');
    });
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
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
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
          <span className="text-gray-500">Role:</span> {profile.role}
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
          <input
            type="password"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
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
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm">
          Update Password
        </button>
      </form>
    </div>
  );
}
