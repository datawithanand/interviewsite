/**
 * Decorative scene shared by the Login and Register pages.
 * Purely visual: aria-hidden, pointer-events-none, and every added element
 * is anchored to a corner/edge so it never competes with the auth card.
 */
export default function AuthBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Ambient color blobs, tuned to the ocean-slate palette */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-300/15 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/3 -right-20 w-96 h-96 bg-sky-400/20 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
      <div className="absolute -bottom-24 left-1/4 w-80 h-80 bg-teal-300/15 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
      <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-amber-300/10 rounded-full blur-3xl animate-pulse [animation-delay:1.5s]" />

      {/* Oversized brace tucked in the corner as quiet texture */}
      <div className="absolute -top-10 -right-6 text-[16rem] leading-none opacity-[0.09] select-none font-mono text-white rotate-6">
        {'{ }'}
      </div>

      {/* Rubber duck debugging, bottom-left */}
      <svg
        className="hidden sm:block absolute bottom-6 left-6 w-20 h-20 md:w-24 md:h-24 text-white/75 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>Rubber duck debugging: works every time.</title>
        <path d="M8 82c6 3 12 3 18 0s12-3 18 0 12 3 18 0 12-3 18 0" opacity="0.6" />
        <path d="M14 90c5 2.5 10 2.5 15 0s10-2.5 15 0 10 2.5 15 0" opacity="0.4" />
        <path
          d="M28 80c-6-3-10-10-8-18 2-9 10-14 10-24 0-9 7-16 17-16 8 0 14 5 16 12 5 1 9 5 9 11 0 5-3 8-3 8s6 2 6 10c0 12-11 20-11 20s2 3 2 6c0 3-3 5-3 5H30s-2-2-2-5c0-3 0-9 0-9z"
          fill="rgb(255 255 255 / 0.06)"
        />
        <path d="M34 52c4-2 9-1 11 2" opacity="0.8" />
        <circle cx="57" cy="27" r="1.8" fill="currentColor" stroke="none" />
        <path d="M64 30c4 0 7 2 7 4s-3 4-7 4c-2 0-4-1-5-2" fill="rgb(252 211 77 / 0.8)" stroke="rgb(252 211 77 / 0.9)" />
        <circle cx="74" cy="12" r="1.4" fill="currentColor" stroke="none" opacity="0.85" />
        <circle cx="78" cy="8" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
        <text x="73.3" y="9.7" fontSize="5.8" fontFamily="ui-monospace, monospace" fill="rgb(11 18 32)" stroke="none">
          ?
        </text>
      </svg>

      {/* Encouraging terminal, top-right below the brace */}
      <div className="hidden sm:block absolute top-24 right-6 md:top-28 md:right-10 w-44 md:w-52 rounded-lg border border-white/25 bg-white/10 backdrop-blur-sm overflow-hidden shadow-lg shadow-black/20">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/15 bg-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-300/80" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300/80" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300/80" />
        </div>
        <div className="px-2.5 py-2 font-mono text-[10px] leading-relaxed text-white/85">
          <p>$ git commit -m "ready"</p>
          <p className="text-emerald-300/90">
            you got this
            <span className="inline-block w-1.5 h-3 align-middle ml-0.5 bg-emerald-300/90 animate-pulse" />
          </p>
        </div>
      </div>

      {/* Ladybug inspecting under a magnifying glass — "0 bugs found", top-left */}
      <svg
        className="hidden lg:block absolute top-10 left-10 w-16 h-16 text-white/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>Zero bugs found. Probably.</title>
        <circle cx="42" cy="42" r="24" fill="rgb(255 255 255 / 0.05)" />
        <line x1="60" y1="60" x2="82" y2="82" strokeWidth="2.4" />
        <g>
          <ellipse cx="38" cy="40" rx="10" ry="8" fill="rgb(248 113 113 / 0.65)" stroke="rgb(248 113 113 / 0.9)" />
          <line x1="38" y1="33" x2="38" y2="47" stroke="rgb(127 29 29 / 0.7)" />
          <circle cx="34" cy="37" r="1.2" fill="rgb(127 29 29 / 0.8)" stroke="none" />
          <circle cx="42" cy="43" r="1.2" fill="rgb(127 29 29 / 0.8)" stroke="none" />
          <circle cx="34" cy="44" r="1.2" fill="rgb(127 29 29 / 0.8)" stroke="none" />
          <circle cx="30" cy="40" r="2.6" fill="rgb(127 29 29 / 0.85)" stroke="none" />
        </g>
        <path d="M70 25l4 4M76 20l3 5" opacity="0.7" />
      </svg>

      {/* Coffee cup with steam curling into a question mark, bottom-right */}
      <svg
        className="hidden lg:block absolute bottom-10 right-12 w-16 h-16 text-white/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>Fueled by curiosity (and caffeine).</title>
        <path d="M22 46h40l-4 30a6 6 0 01-6 5H32a6 6 0 01-6-5z" fill="rgb(255 255 255 / 0.06)" />
        <path d="M62 50h7a8 8 0 010 16h-7" />
        <line x1="18" y1="46" x2="66" y2="46" />
        <path d="M34 30c-3-4 2-6 0-11" opacity="0.55" stroke="rgb(253 230 138 / 0.9)" />
        <path d="M52 30c8 2 9-9 3-14 5 1 10 8 6 15-2 4 1 6 1 6" fill="none" opacity="0.85" stroke="rgb(253 230 138 / 0.9)" />
        <circle cx="52" cy="8" r="1.8" fill="rgb(253 230 138 / 0.9)" stroke="none" />
      </svg>

      {/* A few faint floating glyphs for quiet texture */}
      <span className="hidden md:block absolute top-1/2 left-8 text-2xl font-mono text-white/20 select-none">{'</>'}</span>
      <span className="hidden md:block absolute bottom-1/3 right-1/4 text-xl font-mono text-white/20 select-none">;</span>
      <span className="hidden md:block absolute top-16 left-1/3 text-lg font-mono text-white/20 select-none">{'( )'}</span>
    </div>
  );
}
