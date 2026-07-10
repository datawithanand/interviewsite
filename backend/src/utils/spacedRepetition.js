// A lightweight SM-2 variant (as popularized by Anki). Ratings map to the
// four self-assessment buttons shown on the Practice flashcard: Again,
// Hard, Good, Easy.
const RATINGS = Object.freeze(['AGAIN', 'HARD', 'GOOD', 'EASY']);

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 180;

// Derives the next scheduling state for a QuestionProgress row given a
// rating. `progress` only needs { easeFactor, intervalDays, repetitions }.
function computeNextReview(progress, rating) {
  let { easeFactor, intervalDays, repetitions } = progress;

  if (rating === 'AGAIN') {
    repetitions = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
    intervalDays = 0; // due again almost immediately (~10 minutes)
  } else {
    repetitions += 1;
    if (rating === 'HARD') {
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
      intervalDays = repetitions === 1 ? 1 : Math.max(1, intervalDays * 1.2);
    } else if (rating === 'GOOD') {
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 3;
      else intervalDays = intervalDays * easeFactor;
    } else if (rating === 'EASY') {
      easeFactor += 0.15;
      intervalDays = repetitions === 1 ? 4 : intervalDays * easeFactor * 1.3;
    }
  }

  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);
  const minutesUntilDue = rating === 'AGAIN' ? 10 : Math.max(intervalDays, 0.5) * 24 * 60;
  const nextReviewAt = new Date(Date.now() + minutesUntilDue * 60 * 1000);

  return { easeFactor, intervalDays, repetitions, nextReviewAt };
}

function deriveStatus({ repetitions, intervalDays, correctStreak }) {
  if (repetitions === 0) return 'NEW';
  if (intervalDays >= 21 && correctStreak >= 3) return 'MASTERED';
  if (repetitions >= 2) return 'REVIEWING';
  return 'LEARNING';
}

module.exports = { RATINGS, computeNextReview, deriveStatus, MIN_EASE };
