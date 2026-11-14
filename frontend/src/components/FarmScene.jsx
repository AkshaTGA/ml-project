/** A quiet field in perspective. Decorative only. */
export function FarmScene({ className = '' }) {
  const rows = [168, 182, 198, 216, 236, 258, 282]
  return (
    <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="field-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d5e7f4" />
          <stop offset="70%" stopColor="#e7f1e4" />
          <stop offset="100%" stopColor="#f4f7ef" />
        </linearGradient>
        <linearGradient id="field-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fbf68" />
          <stop offset="100%" stopColor="#5f9444" />
        </linearGradient>
      </defs>
      <rect width="640" height="300" fill="url(#field-sky)" />
      <circle cx="548" cy="58" r="22" fill="#e7c56a" />
      <path d="M0 118c90-28 170-8 250-22 96-16 150 18 250 4 70-8 110 6 140-6v36H0Z" fill="#d5e8c8" />
      <path d="M0 146c120-22 210-6 320-18 130-14 210 10 320-4v176H0Z" fill="url(#field-earth)" />
      <g fill="none" stroke="#3f7a34" strokeWidth="1.15" opacity="0.45">
        {rows.map((y) => <path key={y} d={`M0 ${y + 18}C220 ${y - 16} 420 ${y - 8} 640 ${y + 10}`} />)}
        {[-280, -160, -60, 40, 150, 260, 380, 500].map((x) => (
          <path key={x} d={`M320 132 L${x} 300`} />
        ))}
      </g>
      <path d="M86 150c8-46 18-70 22-92 4 22 14 46 22 92" fill="#2f6a38" />
      <path d="M104 78c6-18 10-28 12-40 2 12 6 22 12 40" fill="#3e7c44" />
      <path d="M548 156c6-34 12-52 16-68 4 16 10 34 16 68" fill="#2c6234" opacity="0.85" />
    </svg>
  )
}

export function WheatArt({ className = '' }) {
  return (
    <svg viewBox="0 0 180 140" className={className} aria-hidden>
      <g fill="none" strokeLinecap="round">
        <path d="M40 132c8-40-6-62 8-96" stroke="#c6a15a" strokeWidth="3" />
        <path d="M78 136c6-46-10-70 4-108" stroke="#d2ae62" strokeWidth="3" />
        <path d="M118 130c10-38-2-64 12-100" stroke="#b89245" strokeWidth="3" />
        <path d="M150 134c4-32-8-52 2-84" stroke="#c6a15a" strokeWidth="2.5" />
      </g>
      <g fill="#e2c36a">
        <ellipse cx="36" cy="78" rx="7" ry="12" transform="rotate(-24 36 78)" />
        <ellipse cx="52" cy="70" rx="7" ry="12" transform="rotate(22 52 70)" />
        <ellipse cx="40" cy="56" rx="6" ry="11" transform="rotate(-20 40 56)" />
        <ellipse cx="54" cy="50" rx="6" ry="11" transform="rotate(18 54 50)" />
        <ellipse cx="74" cy="72" rx="7" ry="13" transform="rotate(-18 74 72)" />
        <ellipse cx="90" cy="64" rx="7" ry="13" transform="rotate(20 90 64)" />
        <ellipse cx="78" cy="48" rx="6" ry="11" transform="rotate(-16 78 48)" />
        <ellipse cx="92" cy="42" rx="6" ry="11" transform="rotate(16 92 42)" />
        <ellipse cx="116" cy="74" rx="7" ry="12" transform="rotate(-22 116 74)" />
        <ellipse cx="134" cy="66" rx="7" ry="12" transform="rotate(24 134 66)" />
        <ellipse cx="122" cy="52" rx="6" ry="11" transform="rotate(-18 122 52)" />
        <ellipse cx="136" cy="46" rx="6" ry="11" transform="rotate(18 136 46)" />
        <ellipse cx="148" cy="86" rx="6" ry="10" transform="rotate(-16 148 86)" />
        <ellipse cx="160" cy="80" rx="6" ry="10" transform="rotate(18 160 80)" />
      </g>
    </svg>
  )
}
