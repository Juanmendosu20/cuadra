// Íconos en línea (sin librerías ni descargas). Trazo de 2 px, heredan el color del texto.
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconoPedidos = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M3 9l1.5-5h15L21 9" />
    <path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
    <path d="M5 13.5V20h14v-6.5" />
  </svg>
);

export const IconoHistorial = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconoRegistro = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

export const IconoMas = ({ size = 24 }: P) => (
  <svg {...base(size)} strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconoAyuda = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </svg>
);

export const IconoCheck = ({ size = 24 }: P) => (
  <svg {...base(size)} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconoCaja = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
    <path d="M3 7.5L12 12l9-4.5M12 12v9" />
  </svg>
);

export const IconoSinSenal = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19" r="0.8" fill="currentColor" />
    <path d="M3 3l18 18" />
  </svg>
);
