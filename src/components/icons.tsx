import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BellRing,
  BookLock,
  Building2,
  Bus,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  Handshake,
  ClipboardCheck,
  ClipboardList,
  Download,
  Ellipsis,
  HardDrive,
  Image as ImageGlyph,
  Medal,
  Star,
  Clock,
  FileText,
  Flag,
  Globe,
  House,
  Inbox,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
  Trophy,
  User,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Line icons of the interface (wave 14): every name maps to a Lucide icon,
 * drawn at 18 px with a 1.75 stroke. Icons are decorative (aria-hidden): the
 * surrounding link or button carries the accessible name. The names of the
 * earlier hand-drawn set are kept so existing calls keep working.
 */
const icons = {
  home: House,
  user: User,
  userRound: UserRound,
  players: Users,
  team: UsersRound,
  userPlus: UserPlus,
  whistle: Flag,
  club: Building2,
  funding: Wallet,
  calendar: CalendarDays,
  attendance: ClipboardCheck,
  chart: ChartColumn,
  document: FileText,
  dues: Receipt,
  inbox: Inbox,
  message: MessageSquare,
  bell: Bell,
  bellRing: BellRing,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  close: X,
  arrow: ArrowRight,
  back: ArrowLeft,
  check: Check,
  badgeCheck: BadgeCheck,
  alert: TriangleAlert,
  clock: Clock,
  wheelchair: Accessibility,
  settings: Settings,
  lock: Lock,
  shield: ShieldCheck,
  bookLock: BookLock,
  wrench: Wrench,
  search: Search,
  trophy: Trophy,
  bus: Bus,
  pin: MapPin,
  landmark: Landmark,
  megaphone: Megaphone,
  piggyBank: PiggyBank,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  handshake: Handshake,
  globe: Globe,
  logOut: LogOut,
  plus: Plus,
  clipboardList: ClipboardList,
  ellipsis: Ellipsis,
  download: Download,
  image: ImageGlyph,
  medal: Medal,
  star: Star,
  storage: HardDrive,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof icons;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={1.75} />;
}

// PCM wordmark. Letters follow the text colour; the stroke of the C keeps the
// brand orange through --logo-accent, the only orange left in the interface.
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
      <path fill="var(--logo-accent, #f97316)" d={logoPaths.accent} />
    </svg>
  );
}
/** Compact round mark (wave 14): the P of the wordmark on the primary colour, for the sidebar brand. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 512 512" className="brand-mark">
      <circle cx="256" cy="256" r="256" fill="var(--primary)" />
      <g transform="translate(84 130) scale(0.88)">
        <path fill="var(--on-primary)" d={logoPaths.letters.split("ZM426.2")[0] + "Z"} />
      </g>
    </svg>
  );
}
