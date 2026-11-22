export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0f3d2a" />
      <g fill="#f6f4ee">
        <rect x="12" y="12" width="17" height="17" rx="3" />
        <rect x="35" y="12" width="17" height="17" rx="3" />
        <rect x="12" y="35" width="17" height="17" rx="3" />
      </g>
      <rect x="35" y="35" width="17" height="17" rx="3" fill="#f2a516" />
    </svg>
  );
}
