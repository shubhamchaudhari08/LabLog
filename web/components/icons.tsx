/**
 * The icon set. Drawn here rather than pulled from a library: the app needs
 * about twenty glyphs, and a shared 1.6 stroke on a 20px grid keeps them one
 * family instead of the default Lucide look.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  );
}

export const Logo = (props: IconProps) => (
  <svg viewBox="0 0 32 32" aria-hidden {...props}>
    <path
      d="M13 7h6v10.5a5 5 0 1 1-6 0V7Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
    />
    <path d="M13 15.5h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const IconOverview = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="6" height="8" rx="1.5" />
    <rect x="11" y="3" width="6" height="5" rx="1.5" />
    <rect x="11" y="10" width="6" height="7" rx="1.5" />
    <rect x="3" y="13" width="6" height="4" rx="1.5" />
  </Icon>
);

export const IconFlask = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3h4M8.5 3v4.5L4 15a1.4 1.4 0 0 0 1.2 2h9.6a1.4 1.4 0 0 0 1.2-2l-4.5-7.5V3" />
    <path d="M6 12.5h8" />
  </Icon>
);

export const IconProtocol = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h8.5a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V5" />
    <path d="M8 7.5h5M8 10.5h5M8 13.5h3" />
    <circle cx="5" cy="4" r="1.4" />
  </Icon>
);

export const IconRuler = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6.5" width="15" height="7" rx="1.5" />
    <path d="M6 6.5v3M9 6.5v2M12 6.5v3M15 6.5v2" />
  </Icon>
);

export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17c.9-3 3.3-4.6 6.2-4.6s5.3 1.6 6.2 4.6" />
  </Icon>
);

export const IconGauge = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 14a6.5 6.5 0 1 1 13 0" />
    <path d="M10 14l3.2-4" />
    <circle cx="10" cy="14" r="1" />
  </Icon>
);

export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.25" y="2.5" width="5.5" height="9.5" rx="2.75" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
  </Icon>
);

export const IconMicOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.75 8.5V5.25a2.75 2.75 0 0 0-5.3-1M7.25 7.5v1.75a2.75 2.75 0 0 0 4.3 2.27" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 9 4.2M15.4 10.6c.07-.36.1-.73.1-1.1M10 15v2.5M3 3l14 14" />
  </Icon>
);

export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="10" height="10" rx="2" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 5l5 5-5 5" />
  </Icon>
);

export const IconChevronsLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 5l-5 5 5 5M15 5l-5 5 5 5" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h8" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

export const IconPencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5Z" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
);

export const IconStar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.2l2 4.3 4.6.5-3.4 3.2.9 4.6L10 13.5l-4.1 2.3.9-4.6L3.4 8l4.6-.5 2-4.3Z" />
  </Icon>
);

export const IconTranscript = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h12M4 9h9M4 12.5h12M4 16h6" />
  </Icon>
);

export const IconSignOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12.5 13.5L16 10l-3.5-3.5M16 10H8" />
  </Icon>
);

export const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 5v10M12.5 5v10" />
  </Icon>
);

/** Leave a full-screen mode: a door with an arrow out of it. */
export const IconExit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h6" />
    <path d="M13.5 7l3 3-3 3M16.5 10H8.5" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5" />
    <path d="M13 13l3.5 3.5" />
  </Icon>
);

export const IconSample = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3h6M8 3v11a2 2 0 0 0 4 0V3" />
    <path d="M8 9h4" />
  </Icon>
);
