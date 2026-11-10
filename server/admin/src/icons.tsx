// Small inline icon set (15px grid, 1.5 stroke) so icon-only buttons never rely on unicode glyphs.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({
  width: 15, height: 15, viewBox: '0 0 15 15', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p,
});

export const PencilIcon = (p: P) => (
  <svg {...base(p)}><path d="M10.2 2.3l2.5 2.5-7.6 7.6-3.1.6.6-3.1z" /><path d="M8.7 3.8l2.5 2.5" /></svg>
);
export const CrossIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 4l7 7M11 4l-7 7" /></svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base(p)}><path d="M2.5 4h10M6 4V2.5h3V4M3.8 4l.6 8.5h6.2l.6-8.5" /></svg>
);
export const ChevronUpIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 9.5l3.5-3.5 3.5 3.5" /></svg>
);
export const ChevronDownIcon = (p: P) => (
  <svg {...base(p)}><path d="M4 5.5l3.5 3.5 3.5-3.5" /></svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}><path d="M7.5 3v9M3 7.5h9" /></svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}><path className="check-path" pathLength={1} d="M3.5 7.8l2.6 2.6 5.4-6" /></svg>
);
export const ResetIcon = (p: P) => (
  <svg {...base(p)}><path d="M2.8 7.5a4.7 4.7 0 1 0 1.4-3.3" /><path d="M2.5 2.2v2.6h2.6" /></svg>
);
export const ExitIcon = (p: P) => (
  <svg {...base(p)}><path d="M6 2.5H3.5v10H6" /><path d="M9.5 4.5l3 3-3 3M12.5 7.5H6" /></svg>
);
export const UploadIcon = (p: P) => (
  <svg {...base(p)}><path d="M7.5 10V2.8M4.6 5.6l2.9-2.9 2.9 2.9" /><path d="M2.5 10.5v2h10v-2" /></svg>
);
