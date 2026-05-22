import { cn } from '@/lib/utils';

export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="hsl(var(--indigo-600, 232 70% 44%))" />
      <path
        d="M6.5 7.5 L12 4 L17.5 7.5 L17.5 13.5 L12 17 L6.5 13.5 Z"
        fill="none" stroke="hsl(36 95% 56%)" strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="1.6" fill="hsl(36 95% 56%)" />
    </svg>
  );
}
