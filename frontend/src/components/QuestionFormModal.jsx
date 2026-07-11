import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import Modal from './Modal';
import HierarchyPicker from './HierarchyPicker';
import { api } from '../api/client';
import { CODE_LANGUAGES, DIFFICULTIES, FORMATS } from '../constants';
import { useTheme } from '../context/ThemeContext';

const emptyForm = {
  title: '',
  format: 'TEXT',
  codeLanguage: 'javascript',
  questionText: '',
  questionCode: '',
  answerText: '',
  answerCode: '',
  difficulty: 'BEGINNER',
  tags: '',
};

function TextOrCodeField({ format, textValue, codeValue, onTextChange, onCodeChange, codeLanguage, dark }) {
  const showText = format !== 'CODE';
  const showCode = format !== 'TEXT';
  // Only label the two boxes individually when both appear together (BOTH
  // format) — with just one box, the section header above already says
  // "Question" / "Answer" and a plain textarea vs. a code editor is
  // self-explanatory, so no extra label is needed.
  const showSubLabels = showText && showCode;
  return (
    <div className="space-y-3">
      {showText && (
        <div>
          {showSubLabels && <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Text</label>}
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            rows={4}
            value={textValue}
            onChange={(e) => onTextChange(e.target.value)}
            required
          />
        </div>
      )}
      {showCode && (
        <div>
          {showSubLabels && <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Code</label>}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <Editor
              height="180px"
              language={codeLanguage}
              theme={dark ? 'vs-dark' : 'light'}
              value={codeValue}
              onChange={(v) => onCodeChange(v || '')}
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionFormModal({ open, onClose, onSaved, nodeId, question }) {
  const { theme } = useTheme();
  const dark = theme !== 'light';
  const [form, setForm] = useState(emptyForm);
  const [selectedNodeId, setSelectedNodeId] = useState(nodeId || null);
  const [selectedNodePath, setSelectedNodePath] = useState(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setForm({
        title: question.title,
        format: question.format,
        codeLanguage: question.codeLanguage || 'javascript',
        questionText: question.questionText || '',
        questionCode: question.questionCode || '',
        answerText: question.answerText || '',
        answerCode: question.answerCode || '',
        difficulty: question.difficulty,
        tags: (question.tags || []).join(', '),
      });
      setSelectedNodeId(question.nodeId);
    } else {
      setForm(emptyForm);
      setSelectedNodeId(nodeId || null);
    }
    setPickingLocation(!question && !nodeId);
    setError('');
  }, [question, nodeId, open]);

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNodePath(null);
      return;
    }
    api.get(`/nodes/${selectedNodeId}`).then((res) => setSelectedNodePath(res.node.path)).catch(() => setSelectedNodePath(null));
  }, [selectedNodeId]);

  const submit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setError('');
      if (!selectedNodeId) {
        setError('Choose where this question belongs first.');
        return;
      }
      setSaving(true);
      try {
        const payload = {
          title: form.title,
          format: form.format,
          codeLanguage: form.format === 'TEXT' ? null : form.codeLanguage,
          questionText: form.format === 'CODE' ? null : form.questionText,
          questionCode: form.format === 'TEXT' ? null : form.questionCode,
          answerText: form.format === 'CODE' ? null : form.answerText,
          answerCode: form.format === 'TEXT' ? null : form.answerCode,
          difficulty: form.difficulty,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        };
        if (question) {
          await api.patch(`/questions/${question.id}`, payload);
        } else {
          await api.post('/questions', { ...payload, nodeId: selectedNodeId });
        }
        onSaved();
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [form, question, selectedNodeId, onSaved, onClose]
  );

  // Ctrl/Cmd+S saves the form instead of triggering the browser's save dialog.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submit]);

  return (
    <Modal open={open} onClose={onClose} title={question ? 'Edit Question' : 'New Question'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Location</label>
          {!question && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {selectedNodePath ? selectedNodePath.map((p) => p.name).join(' > ') : 'Not chosen yet'}
              </span>
              <button type="button" onClick={() => setPickingLocation((v) => !v)} className="text-xs text-brand-600 hover:underline">
                {pickingLocation ? 'Hide' : 'Change'}
              </button>
            </div>
          )}
          {question && (
            <p className="text-sm text-gray-500">{selectedNodePath ? selectedNodePath.map((p) => p.name).join(' > ') : '…'}</p>
          )}
          {!question && pickingLocation && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <HierarchyPicker mode="pickLeaf" initialNodeId={selectedNodeId} onSelect={(id) => {
                setSelectedNodeId(id);
                setPickingLocation(false);
              }} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
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
          {form.format !== 'TEXT' && (
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

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <h4 className="text-sm font-semibold mb-2">Question</h4>
          <TextOrCodeField
            format={form.format}
            textValue={form.questionText}
            codeValue={form.questionCode}
            onTextChange={(v) => setForm({ ...form, questionText: v })}
            onCodeChange={(v) => setForm({ ...form, questionCode: v })}
            codeLanguage={form.codeLanguage}
            dark={dark}
          />
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <h4 className="text-sm font-semibold mb-2">Answer</h4>
          <TextOrCodeField
            format={form.format}
            textValue={form.answerText}
            codeValue={form.answerCode}
            onTextChange={(v) => setForm({ ...form, answerText: v })}
            onCodeChange={(v) => setForm({ ...form, answerCode: v })}
            codeLanguage={form.codeLanguage}
            dark={dark}
          />
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
