interface SprigDoodleProps {
  className?: string;
  flip?: boolean;
}

export function SprigDoodle({ className, flip }: SprigDoodleProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 60"
      style={flip ? { transform: "scaleX(-1) scaleY(-1)" } : undefined}
      aria-hidden="true"
    >
      <path
        d="M4 56 C 30 40, 40 20, 70 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {[
        [18, 47, 30, 34],
        [30, 36, 44, 26],
        [42, 26, 56, 18],
        [54, 16, 66, 10],
      ].map(([x1, y1, x2, y2], i) => (
        <path
          key={i}
          d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 8}, ${x2} ${y2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
      <circle cx="70" cy="6" r="3" fill="currentColor" opacity="0.9" />
    </svg>
  );
}
