interface Props {
  size?: 'sm' | 'md';
}

export default function Logo({ size = 'sm' }: Props) {
  const iconSize = size === 'md' ? 28 : 20;
  const textSize = size === 'md' ? '1.0625rem' : '0.9375rem';

  return (
    <div className="flex items-center gap-2">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bottom chevron — 0.2 opacity */}
        <polyline
          points="4,16 10,11 16,16"
          stroke="#22c55e"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.2"
        />
        {/* Middle chevron — 0.55 opacity */}
        <polyline
          points="4,11.5 10,6.5 16,11.5"
          stroke="#22c55e"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
        {/* Top chevron — full opacity */}
        <polyline
          points="4,7 10,2 16,7"
          stroke="#22c55e"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="1"
        />
      </svg>
      <span style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: textSize, letterSpacing: '-0.02em' }}>
        New Era
      </span>
    </div>
  );
}
