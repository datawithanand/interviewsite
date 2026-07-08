import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import Modal from './Modal';
import { api } from '../api/client';
import { CODE_LANGUAGES, DIFFICULTIES, FORMATS } from '../constants';
import { useTheme } from '../context/ThemeContext';

const emptyForm = {
  moduleId: '',
  title: '',
  content: '',
  format: 'TEXT',
  codeLanguage: 'javascript',
  answer: '',
  difficulty: 'BEGINNER',
  tags: '',
};

export default function QuestionFormModal({ open, onClose, onSaved, modules, moduleId, question }) {
  const { dark } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setForm({
        moduleId: question.moduleId,
        title: question.title,
        content: question.content,
        format: question.format,
        codeLanguage: question.codeLanguage || 'javascript',
        answer: question.answer,
        difficulty: question.difficulty,
        tags: (question.tags || []).join(', '),
      });
    } else {
      setForm({ ...emptyForm, moduleId: moduleId || (modules[0] && modules[0].id) || '' });
    }
    setError('');
  }, [question, moduleId, modules, open]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        content: form.content,
        format: form.format,
        codeLanguage: form.format === 'TEXT' ? null : form.codeLanguage,
        answer: form.answer,
        difficulty: form.difficulty,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (question) {
        await api.patch(`/questions/${question.id}`, payload);
      } else {
        await api.post('/questions', { ...payload, moduleId: form.moduleId });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const showEditor = form.format !== 'TEXT';

  return (
    <Modal open={open} onClose={onClose} title={question ? 'Edit Question' : 'New Question'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Module</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.moduleId}
              onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
              disabled={!!question}
              required
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Difficulty</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          {showEditor && (
            <div>
              <label className="block text-sm font-medium mb-1">Code Language</label>
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
                value={form.codeLanguage}
                onChange={(e) => setForm({ ...form, codeLanguage: e.target.value })}
              >
                {CODE_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Question Content</label>
          {showEditor ? (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <Editor
                height="200px"
                language={form.codeLanguage}
                theme={dark ? 'vs-dark' : 'light'}
                value={form.content}
                onChange={(v) => setForm({ ...form, content: v || '' })}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
          ) : (
            <textarea
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              rows={4}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Answer</label>
          {showEditor ? (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <Editor
                height="200px"
                language={form.codeLanguage}
                theme={dark ? 'vs-dark' : 'light'}
                value={form.answer}
                onChange={(v) => setForm({ ...form, answer: v || '' })}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
          ) : (
            <textarea
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              rows={4}
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              required
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tags (comma separated)</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="incident, itsm-core"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
