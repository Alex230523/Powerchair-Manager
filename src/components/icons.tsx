// Decorative line icons (24px grid, stroke = currentColor). Always aria-hidden:
// the surrounding link or button carries the accessible name.
const paths = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  players:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3.5 5.5",
  whistle:
    "M14 8h7v4l-4 1a6 6 0 1 1-6-5h3Zm-6 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 3l1.5 3M11 2v3",
  club: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4",
  funding:
    "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z",
  calendar: "M4 5h16a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Zm-1 6h18M8 3v4m8-4v4",
  attendance: "M4 5h16v15H4zM8 3v4m8-4v4M8.5 13.5l2.5 2.5 4.5-5",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  document:
    "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zm0 0v5h5M9 13h6m-6 4h6",
  dues: "M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10h9M4 14h9",
  inbox:
    "M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  message:
    "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4a2 2 0 0 0 4 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "M5 12.5 10 17l9-10",
  alert: "M12 3 2 20h20zm0 6v5m0 3v.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  wheelchair:
    "M10.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 7.5V13h5l3 5h2M9 10h4.5M7 10.6a5.5 5.5 0 1 0 7.6 6.6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4 0a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  back: "M19 12H5m6-6-6 6 6 6",
  wrench:
    "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  team: "M12 2.5 15 8l6 .9-4.5 4.3 1.1 6.3L12 16.6l-5.6 2.9 1.1-6.3L3 8.9 9 8z",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
// Brand mark: a wheel with a ball, drawn for the orange tile.
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
    >
      <circle cx="13" cy="17" r="9" stroke="#1c1917" strokeWidth="2.6" />
      <circle cx="13" cy="17" r="2.4" fill="#1c1917" />
      <path
        d="M13 8v6.6M13 19.4V26M4 17h6.6M15.4 17H22"
        stroke="#1c1917"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="25"
        cy="8"
        r="4.4"
        fill="#fff"
        stroke="#1c1917"
        strokeWidth="1.8"
      />
    </svg>
  );
}
