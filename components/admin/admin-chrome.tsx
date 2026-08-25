/**
 * The decorative admin backdrop — mesh gradient, dot overlay, floating orbs and
 * game pieces. Shared by the dashboard layout and the login page so signing in
 * looks like part of the same room.
 */
export function AdminChrome() {
  return (
    <>
      {/* Dot pattern overlay */}
      <div className="pointer-events-none fixed inset-0 dot-pattern" />

      {/* Floating decorative orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-32 h-80 w-80 rounded-full bg-primary/8 blur-3xl float" />
        <div className="absolute -right-32 top-64 h-64 w-64 rounded-full bg-accent/8 blur-3xl float" style={{ animationDelay: '-3s' }} />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-primary/6 blur-3xl float" style={{ animationDelay: '-1.5s' }} />
      </div>

      {/* Floating game pieces */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Dice */}
        <svg className="absolute left-[3%] top-[18%] h-12 w-12 text-primary/12 float-rotate" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="#cae1ff">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill="#3b69a5" />
          <circle cx="12" cy="12" r="1.5" fill="#3867a3" />
          <circle cx="16" cy="16" r="1.5" fill="#465f80" />
        </svg>

        {/* Chess Knight */}
        <svg className="absolute right-[4%] top-[22%] h-10 w-10 text-accent/10 float-rotate" style={{ animationDelay: '-2s' }} viewBox="0 0 24 24" fill="#416da7">
          <path d="M19 22H5v-2h14v2m-3-4H8l.5-2H7V9a2 2 0 0 1 2-2h1V5h-.5c-.28 0-.5-.22-.5-.5V4c0-.28.22-.5.5-.5H12l1 1h1.5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5H13l1 3h.5a.5.5 0 0 1 .5.5V15h1l.5 3z" />
        </svg>

        {/* Playing Card */}
        <svg className="absolute left-[5%] bottom-[28%] h-11 w-11 text-primary/10 float-rotate" style={{ animationDelay: '-4s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M12 6l1.5 3 3.5.5-2.5 2.5.5 3.5L12 14l-3 1.5.5-3.5L7 9.5 10.5 9 12 6z" fill="#416da7" />
        </svg>

        {/* Puzzle Piece */}
        <svg className="absolute right-[5%] bottom-[32%] h-9 w-9 text-accent/12 float-rotate" style={{ animationDelay: '-1s' }} viewBox="0 0 24 24" fill="#416da7">
          <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
        </svg>

        {/* Meeple */}
        <svg className="absolute left-[2%] top-[55%] h-8 w-8 text-accent/12 float-rotate" style={{ animationDelay: '-3s' }} viewBox="0 0 24 24" fill="#416da7">
          <path d="M12 2C10.34 2 9 3.34 9 5c0 1.3.84 2.4 2 2.82V9H8.5c-.83 0-1.5.67-1.5 1.5S7.67 12 8.5 12H9v1H5v9h14v-9h-4v-1h.5c.83 0 1.5-.67 1.5-1.5S16.33 9 15.5 9H13V7.82c1.16-.42 2-1.52 2-2.82 0-1.66-1.34-3-3-3z" />
        </svg>

        {/* Second Dice */}
        <svg className="absolute right-[3%] top-[50%] h-7 w-7 text-primary/10 float-rotate" style={{ animationDelay: '-5s' }} viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill="#395780" />
          <circle cx="16" cy="8" r="1.5" fill="#3a6296" />
          <circle cx="8" cy="16" r="1.5" fill="#3d5370" />
          <circle cx="16" cy="16" r="1.5" fill="#31588b" />
        </svg>

        {/* Game Controller */}
        <svg className="absolute left-[8%] top-[8%] h-9 w-9 text-accent/10 float-rotate" style={{ animationDelay: '-6s' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.97 16L5 19c-1.5 1.5-4 .5-4-2V9c0-1.1.9-2 2-2h1.09c.53 0 1.04.21 1.41.59L9 11h6l3.5-3.41c.37-.38.88-.59 1.41-.59H21c1.1 0 2 .9 2 2v8c0 2.5-2.5 3.5-4 2l-2.97-3H7.97z" />
          <circle cx="8" cy="12" r="1" fill="#436899" />
          <circle cx="16" cy="12" r="1" fill="#6889b3" />
        </svg>

        {/* Stars */}
        <svg className="absolute right-[15%] top-[10%] h-5 w-5 text-primary/15 twinkle" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <svg className="absolute left-[20%] bottom-[12%] h-4 w-4 text-accent/15 twinkle" style={{ animationDelay: '-1s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <svg className="absolute right-[25%] bottom-[18%] h-3 w-3 text-primary/18 twinkle" style={{ animationDelay: '-2s' }} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
    </>
  )
}
