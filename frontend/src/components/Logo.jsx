// The InterviewIQ mark: three connected nodes, a miniature of the
// Technology -> Submodule -> Question tree that structures the whole app.
// Fixed brand-blue -> indigo gradient chip with a white glyph, so it stays
// legible on its own regardless of which theme (Ocean/Sunset/Forest/
// Midnight/Slate/Light/Dark) is currently active.
export default function Logo({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" className={className} aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="url(#interviewiq-logo-gradient)" />
      <defs>
        <linearGradient id="interviewiq-logo-gradient" x1="0" y1="0" x2="34" y2="34">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <circle cx="17" cy="9.5" r="2.6" fill="#fff" />
      <circle cx="10.5" cy="23" r="2.6" fill="#fff" />
      <circle cx="23.5" cy="23" r="2.6" fill="#fff" />
      <path d="M17 12.1L11.4 20.7M17 12.1l5.6 8.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
