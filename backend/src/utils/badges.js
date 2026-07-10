// Fixed badge catalog — evaluated in code rather than stored in the DB, so
// adding a new badge is a code change here plus a criteria check in
// evaluateBadges(), never a migration. UserBadge rows only record which
// codes a user has unlocked.
const BADGES = Object.freeze({
  FIRST_STEPS: { name: 'First Steps', description: 'Reviewed your first question.', icon: '🌱' },
  STREAK_3: { name: 'Warming Up', description: 'Kept a 3-day streak alive.', icon: '🔥' },
  STREAK_7: { name: 'On Fire', description: 'Kept a 7-day streak alive.', icon: '🔥' },
  STREAK_30: { name: 'Unstoppable', description: 'Kept a 30-day streak alive.', icon: '🏆' },
  REVIEWS_50: { name: 'Half Century', description: 'Reviewed 50 questions.', icon: '📚' },
  REVIEWS_200: { name: 'Bookworm', description: 'Reviewed 200 questions.', icon: '📖' },
  MASTERED_10: { name: 'Getting Sharp', description: 'Mastered 10 questions.', icon: '🧠' },
  MASTERED_50: { name: 'Sharp Mind', description: 'Mastered 50 questions.', icon: '🧠' },
  MASTERED_100: { name: 'Interview Ready', description: 'Mastered 100 questions.', icon: '🎯' },
  MOCK_ROOKIE: { name: 'First Mock', description: 'Completed your first mock interview.', icon: '🎤' },
  MOCK_PERFECT: { name: 'Nailed It', description: 'Scored 100% on a mock interview.', icon: '💯' },
  MOCK_VETERAN: { name: 'Veteran', description: 'Completed 10 mock interviews.', icon: '🎖️' },
  LEVEL_5: { name: 'Rising Star', description: 'Reached level 5.', icon: '⭐' },
  LEVEL_10: { name: 'Expert', description: 'Reached level 10.', icon: '🌟' },
});

module.exports = { BADGES };
