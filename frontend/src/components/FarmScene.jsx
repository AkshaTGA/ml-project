/** Soft rural header art: tree, farmhouse, field. Decorative only. */
export function FarmScene({ className = '' }) {
  return (
    <svg viewBox="0 0 520 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="farm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c5e6f8" />
          <stop offset="48%" stopColor="#e5f3e4" />
          <stop offset="100%" stopColor="#f3f6ef" />
        </linearGradient>
        <linearGradient id="farm-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ed56c" />
          <stop offset="100%" stopColor="#5ea344" />
        </linearGradient>
      </defs>
      <rect width="520" height="300" fill="url(#farm-sky)" />
      <circle cx="438" cy="52" r="36" fill="#f6c445" opacity="0.28" />
      <circle cx="438" cy="52" r="24" fill="#f6c445" />
      <g fill="#fff">
        <ellipse cx="86" cy="58" rx="34" ry="15" />
        <ellipse cx="112" cy="52" rx="22" ry="13" />
        <ellipse cx="248" cy="40" rx="26" ry="11" opacity="0.9" />
      </g>
      <path d="M0 168C80 138 150 156 214 140c78-18 130 8 196-6 48-10 78 4 110-8v174H0Z" fill="#d7eec6" />
      <path d="M0 196c90-28 160-8 236-22 86-16 140 16 284-8v134H0Z" fill="url(#farm-field)" />
      <g fill="none" stroke="#4c8c38" strokeWidth="2" opacity="0.35">
        <path d="M16 228c150-18 300-8 490 16" />
        <path d="M8 248c160-16 310-6 504 14" />
        <path d="M0 268c170-14 320-4 520 12" />
      </g>
      <rect x="86" y="148" width="16" height="72" rx="5" fill="#8d5a34" />
      <circle cx="78" cy="140" r="30" fill="#3d8c40" />
      <circle cx="112" cy="132" r="34" fill="#4e9c49" />
      <circle cx="94" cy="112" r="26" fill="#6bb85a" />
      <circle cx="124" cy="156" r="18" fill="#2f7a38" />
      <path d="M248 172 332 124l84 48Z" fill="#d4654a" />
      <path d="M332 124 360 140v-16l-12-8-16 8Z" fill="#b5523c" />
      <rect x="266" y="172" width="132" height="74" rx="3" fill="#f6e7c4" />
      <rect x="314" y="204" width="30" height="42" rx="2" fill="#8d5a34" />
      <rect x="282" y="188" width="24" height="18" rx="2" fill="#f6d56a" />
      <rect x="356" y="188" width="24" height="18" rx="2" fill="#f6d56a" />
      <path d="M294 188v18M282 197h24M368 188v18M356 197h24" stroke="#e4bc55" strokeWidth="1.4" />
      <ellipse cx="250" cy="236" rx="20" ry="11" fill="#3d8c40" />
      <ellipse cx="414" cy="234" rx="18" ry="11" fill="#2f7a38" />
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
