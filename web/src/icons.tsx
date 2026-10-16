import type { ReactNode } from "react";

function Icon({ size, width, className, children }: { size: number; width: number; className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const OkIcon = () => <Icon size={12} width={2.5}><path d="M20 6 9 17l-5-5" /></Icon>;
export const BadIcon = () => <Icon size={12} width={2.5}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
export const PendingIcon = () => <Icon size={12} width={2.5}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const CheckingIcon = () => <Icon size={12} width={2.5}><path d="M21 12a9 9 0 1 1-6.22-8.56" /></Icon>;
export const ExternalIcon = () => <Icon size={13} width={2}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>;
export const AlertIcon = () => <Icon className="icon" size={28} width={1.5}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></Icon>;
export const PlusIcon = () => <Icon size={16} width={2}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
export const MinusIcon = () => <Icon size={16} width={2}><path d="M5 12h14" /></Icon>;
export const ChevronLeftIcon = () => <Icon size={16} width={2}><path d="m15 18-6-6 6-6" /></Icon>;
export const CalendarIcon = () => <Icon className="icon" size={28} width={1.5}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></Icon>;
// Filled, as on the detections guideline's replay timeline.
export const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
  </svg>
);
export const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
