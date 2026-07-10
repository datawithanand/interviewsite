import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api/client';
import { DIFFICULTY_COLOR } from '../constants';
import CommentThread from './CommentThread';

export default function QuestionDetailModal({ open, onClose, questionId }) {
  const [question, setQuestion] = useState(null);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !questionId) return;
    setError('');
    api
      .get(`/questions/${questionId}`)
      .then((res) => setQuestion(res.question))
      .catch((err) => setError(err.message));
  }, [open, questionId]);

  const loadVersions = async () => {
    setShowVersions((v) => !v);
    if (!showVersions) {
      const res = await api.get(`/questions/${questionId}/versions`);
      setVersions(res.versions);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={question ? `#${question.serialNumber} ${question.title}` : 'Question'} wide>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!question && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {question && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[question.difficulty]}`}>
              {question.difficulty}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{question.format}</span>
            {question.codeLanguage && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{question.codeLanguage}</span>
            )}
            <span className="text-gray-400">by {question.createdByUsername || 'unknown'}</span>
            <span className="text-gray-400">· {question.viewCount} views</span>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-1">Question</h4>
            {question.questionText && <p className="text-sm whitespace-pre-wrap mb-2">{question.questionText}</p>}
            {question.questionCode && (
              <pre className="text-sm bg-gray-100 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">
                <code>{question.questionCode}</code>
              </pre>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-1">Answer</h4>
            {question.answerText && <p className="text-sm whitespace-pre-wrap mb-2">{question.answerText}</p>}
            {question.answerCode && (
              <pre className="text-sm bg-gray-100 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">
                <code>{question.answerCode}</code>
              </pre>
            )}
          </div>

          {question.tags && question.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {question.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div>
            <button onClick={loadVersions} className="text-xs text-brand-600 hover:underline">
              {showVersions ? 'Hide' : 'Show'} version history
            </button>
            {showVersions && (
              <ul className="mt-2 space-y-2 text-xs text-gray-500 max-h-40 overflow-y-auto">
                {versions.length === 0 && <li>No previous versions.</li>}
                {versions.map((v) => (
                  <li key={v.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                    v{v.versionNumber} by {v.changedByUsername || 'unknown'} on {new Date(v.changedAt).toLocaleString()}
                    {v.changeDescription ? ` — ${v.changeDescription}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <CommentThread questionId={question.id} />
          </div>
        </div>
      )}
    </Modal>
  );
}
