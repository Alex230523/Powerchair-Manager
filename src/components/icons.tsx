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
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2L21 21",
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
// PCM wordmark. Letters follow the text colour (white on the dark sidebar,
// near black elsewhere); the orange stroke of the C keeps the brand colour.
export const logoPaths = {
  letters:
    "M1.8 249.5L75 249.8L133 172.8L284.2 172.8L306 168.8L328.5 158.8L344.2 147.8L357.8 134.2L369.5 117.8L377.8 100.5L383.8 77L384.8 59.2L381.8 43L376.8 31.8L370.8 23.2L358.2 12.2L346.2 6L330 2L57.8 1.8L103.5 60.5L112.5 66.5L117.2 67.8L297.8 67.8L304 69.8L307.5 73L310 78.5L310 86L304.2 98L297.2 104L290 107L109.2 107L98.8 109L91.5 112.2L84.2 117L76 126.5ZM426.2 38L409.5 60.2L399.2 82.2L376 173.2L374.5 194.5L377 209.2L384.2 224.8L393.2 234.8L407.5 243.8L417.8 247.5L430.2 249.8L624.5 250L649.2 249L664.8 187.5L664.5 184.2L460.5 184L455 181L451 175.5L450 166.2L474.5 68.5L450.8 67.2L453 65L453.5 66.5L462.2 66.2L458.8 64.8L457.8 60.5L455.2 61.5L467.2 45.5L468.5 45L468 47.8L471.2 44.2L472.8 40.2L468.2 44.8L499 3.2L482.8 5L462.2 12L443.5 23ZM722 2.2L660.8 249.8L732 249.2L766.8 107L768.2 105L845.5 218.2L978 110L943 249.5L1019.8 249.2L1066.8 76.2L1085 3L1017 2L1004.8 6L872.8 117L796 5L788 1.8Z",
  accent: "M450 68.5L655 69L707.8 4.8L708.2 2.5L500 2L450.2 66.5Z",
};
export function BrandLogo({ height = 24 }: { height?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={height}
      width={Math.round((height * 1087) / 252)}
      viewBox="0 0 1087 252"
    >
      <path fill="currentColor" d={logoPaths.letters} />
      <path fill="#fa6f1d" d={logoPaths.accent} />
    </svg>
  );
}
