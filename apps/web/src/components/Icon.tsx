import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "stock"
  | "meter"
  | "reading"
  | "reconcile"
  | "report"
  | "settings"
  | "alert"
  | "check"
  | "info"
  | "arrow"
  | "activity"
  | "user"
  | "accounts"
  | "eye"
  | "eyeOff";

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  stock: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </>
  ),
  meter: (
    <>
      <rect x="4" y="3" width="11" height="18" />
      <rect x="6.5" y="6" width="6" height="5" />
      <path d="M15 7h2l2 3v7a2 2 0 0 0 2 2" />
      <path d="M2.5 21h14" />
    </>
  ),
  reading: (
    <>
      <path d="M5 19a9 9 0 1 1 14 0" />
      <path d="m12 14 4-5" />
      <path d="M8 19h8" />
      <path d="M7 9h.1M12 7h.1M17 9h.1" />
    </>
  ),
  reconcile: (
    <>
      <path d="M20 7h-9" />
      <path d="m17 4 3 3-3 3" />
      <path d="M4 17h9" />
      <path d="m7 20-3-3 3-3" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  alert: <path d="M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3v.1" />,
  check: <path d="m5 12 4 4L19 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8v.1" />
    </>
  ),
  arrow: <path d="m9 18 6-6-6-6" />,
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7" />
    </>
  ),
  accounts: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c.5-4 2.5-6 6-6 2.2 0 3.8.8 4.8 2.4" />
      <path d="M17 11v8M13 15h8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3 21 21" />
      <path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.1 2.8" />
      <path d="M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" />
    </>
  ),
};
