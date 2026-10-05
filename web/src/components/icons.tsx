// Iconos SVG (estilo outline) para reemplazar emojis en la interfaz.
import type { SVGProps } from "react";

function Svg({ children, className = "h-5 w-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export const IconoAdjuntar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>
);
export const IconoIA = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4L12 3z" /><path d="M5 16l.7 2L8 18.7 6 19.4 5.3 21 4.6 19.4 3 18.7 4.6 18z" /></Svg>
);
export const IconoMicro = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 11v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8" /></Svg>
);
export const IconoNota = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>
);
export const IconoInfo = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Svg>
);
export const IconoEnviar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Svg>
);
export const IconoBot = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M9 4h6M9 14h.01M15 14h.01" /></Svg>
);
export const IconoReloj = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const IconoDescargar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></Svg>
);
export const IconoAlerta = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M10.29 3.86l-8.48 14.7A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.72-3.44l-8.48-14.7a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const IconoEditar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>
);
export const IconoCerrar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>
);
export const IconoCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>
);
export const IconoFlecha = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>
);
export const IconoDeshacer = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8" /></Svg>
);
