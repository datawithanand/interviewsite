import { DIFFICULTY_COLOR } from '../constants';

export default function QuestionCardBody({ question, showAnswer }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className={`px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[question.difficulty]}`}>{question.difficulty}</span>
        {question.node && <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{question.node.name}</span>}
        {question.codeLanguage && <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{question.codeLanguage}</span>}
      </div>

      <div>
        {question.format === 'TEXT' && <h4 className="text-sm font-semibold mb-1 text-gray-500 dark:text-gray-400">Question</h4>}
        <p className="text-base font-medium mb-1">{question.title}</p>
        {question.questionText && <p className="text-sm whitespace-pre-wrap mb-2">{question.questionText}</p>}
        {question.questionCode && (
          <pre className="text-sm bg-gray-100 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">
            <code>{question.questionCode}</code>
          </pre>
        )}
      </div>

      {/* Only TEXT questions have a separate Answer to reveal — CODE/BOTH
          hold everything above, so callers skip the reveal step entirely. */}
      {showAnswer && (question.answerText || question.answerCode) && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-semibold mb-1 text-gray-500 dark:text-gray-400">Answer</h4>
          {question.answerText && <p className="text-sm whitespace-pre-wrap mb-2">{question.answerText}</p>}
          {question.answerCode && (
            <pre className="text-sm bg-gray-100 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">
              <code>{question.answerCode}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
