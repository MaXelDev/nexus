// Blue line icons shared by NEXUS PC and NEXUS Android (same strokes as the mockups).
import type { WxIcon } from "./format";

export const ICON = {
  notion: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/>',
  claude: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 15h2"/>',
  cloudSun: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.2M2.5 9h1.2M4.4 4.4l.9.9M13.6 4.4l-.9.9"/><path d="M8 20h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.4A3.3 3.3 0 0 0 8 20z"/>',
};
export const svg = (paths: string, size = 20, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#8AB4F8" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const WX_ICON: Record<WxIcon, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  cloudSun: ICON.cloudSun,
  cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 7 19z"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  snow: '<path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M8 19h.01M12 20h.01M16 19h.01"/>',
  storm: '<path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>',
};
