import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function SecurityQuestionsPanel() {
  const [templates, setTemplates] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.get('/security-question-templates/all').then((res) => setTemplates(res.templates)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!newQuestion.trim()) return;
    try {
      await api.post('/security-question-templates', { question: newQuestion.trim() });
      setNewQuestion('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (t) => {
    await api.patch(`/security-question-templates/${t.id}`, { isActive: !t.isActive });
    load();
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.question}"? Users who selected it keep their answer; this only removes it from the picker.`)) return;
    await api.del(`/security-question-templates/${t.id}`);
    load();
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-sm">Security Questions</h3>
      <p className="text-xs text-gray-500">
        The predefined question pool users can choose from at registration (they can also write a custom one).
      </p>

      <form onSubmit={add} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
          placeholder="Add a new question…"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
        />
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-2 text-sm">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {templates.length === 0 && <p className="text-xs text-gray-400 py-2">No questions yet.</p>}
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 text-sm">
            <span className={t.isActive ? '' : 'text-gray-400 line-through'}>{t.question}</span>
            <span className="flex gap-2 shrink-0">
              <button onClick={() => toggleActive(t)} className="text-xs text-brand-600 hover:underline">
                {t.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => remove(t)} className="text-xs text-red-600 hover:underline">
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
