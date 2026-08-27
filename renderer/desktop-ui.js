'use strict'
/**
 * Desktop settings integrated into the OFFICIAL settings dialog. The official
 * Web UI's bottom-left settings button opens a centered modal whose nav rail
 * lists sections (general / models / plugins / agent-presets). This module
 * appends desktop-owned rows to that exact nav (cloning the official cell
 * classes, including the hashed CSS-module names learned at runtime) and
 * renders desktop sections inside the official `.options` area, styled with
 * the official dsw tokens and the settings-panel design language (14/22 body,
 * 12/18 caption, capsule controls h36 r18, 32px fields, border-l2 hairlines).
 *
 * No new click targets exist: the only entry is the official settings button.
 * @module dsh-desktop/desktop-ui
 */

/** Official 16px nav glyph paths, copied verbatim from dsh-client-ui-primitives. */
const ICONS = {
  settings: {
    viewBox: '0 0 16 16',
    paths: [
      'M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z',
      'M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z',
    ],
  },
  skill: {
    viewBox: '0 0 16 16',
    paths: [
      'M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z',
      'M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33295 2.91984 1.47867 2.37225 1.82422 1.89649C2.02613 1.61864 2.27098 1.37379 2.54883 1.17188C3.02472 0.826181 3.57197 0.6806 4.20215 0.612307C4.81976 0.545393 5.594 0.546877 6.55371 0.546878H9.02246ZM9.19629 9.14649H4.5459V7.84571H9.19629V9.14649ZM11.0303 6.10645H4.5459V4.80567H11.0303V6.10645Z',
    ],
  },
  plugins: {
    viewBox: '0 0 16 16',
    transform: 'translate(1.292 1.3)',
    paths: [
      'M10.3232 9.18164C11.2868 9.18164 12.0985 9.82833 12.3506 10.7109L13.415 10.7109L13.415 11.8711L12.3496 11.8711C12.0971 12.7532 11.2864 13.3994 10.3232 13.3994C9.36031 13.3992 8.55012 12.7531 8.29785 11.8711L0 11.8711L0 10.7109L8.29688 10.7109C8.54876 9.82845 9.35988 9.18186 10.3232 9.18164ZM10.3232 10.3418C9.7999 10.3421 9.37534 10.7667 9.375 11.29C9.375 11.8137 9.79969 12.239 10.3232 12.2393C10.847 12.2393 11.2725 11.8138 11.2725 11.29C11.2721 10.7666 10.8468 10.3418 10.3232 10.3418ZM3.08301 4.59082C4.04605 4.59095 4.85696 5.23717 5.10938 6.11914L13.415 6.11914L13.415 7.2793L5.11035 7.2793C4.85833 8.16202 4.04648 8.80846 3.08301 8.80859C2.11972 8.80843 1.30963 8.16179 1.05762 7.2793L0 7.2793L0 6.11914L1.05762 6.11914C1.30994 5.23728 2.12006 4.59098 3.08301 4.59082ZM3.08301 5.75098C2.55962 5.75117 2.13512 6.17587 2.13477 6.69922C2.13477 7.22287 2.5594 7.64824 3.08301 7.64844C3.60665 7.64828 4.03223 7.2229 4.03223 6.69922C4.03187 6.17585 3.60643 5.75113 3.08301 5.75098ZM10.3232 0C11.2869 0 12.0986 0.646596 12.3506 1.5293L13.415 1.5293L13.415 2.68945L12.3496 2.68945C12.363 2.64266 12.3754 2.59488 12.3857 2.54688C12.1838 3.50118 11.3376 4.21777 10.3232 4.21777C9.36037 4.21756 8.55018 3.57139 8.29785 2.68945L0 2.68945L0 1.5293L8.29688 1.5293C8.5487 0.646717 9.35981 0.00021854 10.3232 0ZM10.3232 1.16016C9.79984 1.16042 9.37524 1.58499 9.375 2.1084C9.375 2.63201 9.79969 3.05735 10.3232 3.05762C10.847 3.05762 11.2725 2.63217 11.2725 2.1084C11.2721 1.58483 10.8469 1.16016 10.3232 1.16016Z',
    ],
  },
  download: {
    viewBox: '0 0 16 16',
    paths: [
      'M15.3695 11.411L15.1234 12.8866C14.8869 14.3042 13.6603 15.3436 12.223 15.3436H3.77673C2.33958 15.3434 1.1128 14.3042 0.876343 12.8866L0.630249 11.411L2.05408 11.1747L2.29919 12.6493C2.41973 13.3713 3.04475 13.9001 3.77673 13.9003H12.223C12.9551 13.9002 13.58 13.3713 13.7006 12.6493L13.9457 11.1747L15.3695 11.411ZM8.72205 8.994C8.77717 8.93934 8.83792 8.88106 8.90271 8.81627L12.4828 5.23424L13.5043 6.25572L9.92224 9.8358C9.6395 10.1185 9.38763 10.3732 9.15857 10.5575C8.91892 10.7503 8.63953 10.9224 8.2865 10.9784C8.09711 11.0083 7.90363 11.0083 7.71423 10.9784C7.36106 10.9224 7.0809 10.7503 6.84119 10.5575C6.61215 10.3732 6.36022 10.1185 6.07751 9.8358L2.49646 6.25572L3.51697 5.23424L7.09705 8.81627C7.16219 8.88142 7.22331 8.94006 7.27869 8.99498V1.3065H8.72205V8.994Z',
    ],
  },
  puzzle: {
    viewBox: '0 0 16 16',
    paths: [
      'M5.5 1.5C5.5 0.671573 6.17157 0 7 0C7.82843 0 8.5 0.671573 8.5 1.5V2.5H11.5C12.3284 2.5 13 3.17157 13 4V7H14C14.8284 7 15.5 7.67157 15.5 8.5C15.5 9.32843 14.8284 10 14 10H13V13C13 13.8284 12.3284 14.5 11.5 14.5H8V13.5C8 12.6716 7.32843 12 6.5 12C5.67157 12 5 12.6716 5 13.5V14.5H2C1.17157 14.5 0.5 13.8284 0.5 13V10H1.5C2.32843 10 3 9.32843 3 8.5C3 7.67157 2.32843 7 1.5 7H0.5V4C0.5 3.17157 1.17157 2.5 2 2.5H5.5V1.5Z',
    ],
  },
  usage: {
    viewBox: '0 0 16 16',
    paths: [
      'M1.5 2.5C1.5 1.94772 1.94772 1.5 2.5 1.5H13.5C14.0523 1.5 14.5 1.94772 14.5 2.5V13.5C14.5 14.0523 14.0523 14.5 13.5 14.5H2.5C1.94772 14.5 1.5 14.0523 1.5 13.5V2.5ZM2.94444 2.94444V13.0556H13.0556V2.94444H2.94444ZM4.33333 10.1667H5.77778V11.6111H4.33333V10.1667ZM7.22222 8H8.66667V11.6111H7.22222V8ZM10.1111 5.11111H11.5556V11.6111H10.1111V5.11111Z',
    ],
  },
}

/** Official nav glyph SVG (inline, currentColor — same as ui-primitives). */
function navIconSvg(icon, iconClass) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', icon.viewBox)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('aria-hidden', 'true')
  if (iconClass) svg.setAttribute('class', iconClass)
  for (const d of icon.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'currentColor')
    if (icon.transform) path.setAttribute('transform', icon.transform)
    svg.appendChild(path)
  }
  return svg
}

/* Official settings-panel design language, scoped under .dshdx- and colored
 * exclusively through --dsw-alias-* tokens so light/dark themes follow the
 * official shell. Geometry mirrors ModelsSection/SettingsRoot conventions. */
const CSS = `
.dshdx-section { display: flex; flex-direction: column; gap: 12px; max-width: 720px; color: var(--dsw-alias-label-primary); }
.dshdx-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshdx-subtitle { margin: 4px 0 0; font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dshdx-intro { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-tertiary); }
.dshdx-caption { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dshdx-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
.dshdx-cardhead { display: flex; align-items: center; gap: 10px; }
.dshdx-cardtitle { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshdx-cardactions { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.dshdx-rowline { display: flex; align-items: center; gap: 10px; font-size: 14px; line-height: 22px; }
.dshdx-sub { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshdx-tag { flex: none; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 4px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dshdx-tag-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dshdx-tag-err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dshdx-tag-warn { color: var(--dsw-alias-state-warn-label); border-color: var(--dsw-alias-state-warn-label); }
.dshdx-dot { box-sizing: border-box; display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-quaternary); }
.dshdx-dot-ok { background: var(--dsw-alias-state-success-primary); }
.dshdx-dot-err { background: var(--dsw-alias-state-error-primary); }
.dshdx-dot-busy { background: var(--dsw-alias-state-warn-label); }
.dshdx-stack { display: flex; flex-direction: column; gap: 8px; }
.dshdx-field { display: flex; flex-direction: column; gap: 6px; }
.dshdx-fieldlabel { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dshdx-input, .dshdx-select, .dshdx-textarea { box-sizing: border-box; width: 100%; height: 32px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; }
.dshdx-textarea { height: auto; min-height: 64px; resize: vertical; font-family: inherit; }
.dshdx-input:focus, .dshdx-select:focus, .dshdx-textarea:focus { outline: none; border-color: var(--dsw-alias-border-activated); }
.dshdx-inputrow { display: flex; gap: 8px; align-items: center; }
.dshdx-inputrow > .dshdx-input, .dshdx-inputrow > .dshdx-select { flex: 1; }
.dshdx-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 36px; padding: 0 14px; border: none; border-radius: 18px; font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.dshdx-btn-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.dshdx-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshdx-btn-secondary { border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); }
.dshdx-btn-secondary:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshdx-btn-danger { background: transparent; color: var(--dsw-alias-state-error-primary); }
.dshdx-btn-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger); }
.dshdx-btn-sm { height: 28px; padding: 0 10px; border-radius: 14px; font-size: 12px; line-height: 18px; }
.dshdx-btn:disabled { opacity: 0.4; cursor: default; }
.dshdx-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
.dshdx-switchrow { display: flex; align-items: center; gap: 10px; font-size: 14px; line-height: 22px; cursor: pointer; }
.dshdx-switch { appearance: none; -webkit-appearance: none; box-sizing: border-box; flex: none; width: 36px; height: 20px; margin: 0; border-radius: 10px; background: var(--dsw-alias-interactive-bg-filled-quaternary); position: relative; cursor: pointer; transition: background .15s ease; }
.dshdx-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); transition: left .15s ease; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.dshdx-switch:checked { background: var(--dsw-alias-button-primary-fill); }
.dshdx-switch:checked::after { left: 18px; }
.dshdx-editor { border-radius: 12px; background: var(--dsw-alias-bg-module-platform); padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.dshdx-kvrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
.dshdx-path { color: var(--dsw-alias-label-quaternary); font-size: 12px; line-height: 18px; word-break: break-all; }
.dshdx-issue { color: var(--dsw-alias-state-warn-label); font-size: 12px; line-height: 18px; }
.dshdx-progress { background: var(--dsw-alias-bg-module-platform); border-radius: 8px; padding: 12px; font-size: 12px; line-height: 18px; max-height: 180px; overflow: auto; white-space: pre-wrap; font-family: inherit; color: var(--dsw-alias-label-secondary); }
.dshdx-search { max-width: 220px; margin-left: auto; }
.dshdx-notice { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-warn-label); }
.dshdx-logsmask { position: fixed; inset: 0; z-index: 1200; background: var(--dsw-alias-bg-mask-1); backdrop-filter: var(--dsw-mask-blur); display: flex; align-items: center; justify-content: center; }
.dshdx-logspanel { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; width: min(760px, 80vw); height: min(560px, 70vh); border-radius: 24px; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-shadow-lv3); padding: 18px; }
.dshdx-logspre { flex: 1; overflow: auto; margin: 0; border-radius: 12px; background: var(--dsw-alias-bg-module-platform); padding: 14px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; }
.dshdx-toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); z-index: 1300; background: var(--dsw-alias-bg-inverse); color: var(--dsw-alias-label-inverse); padding: 10px 18px; border-radius: 10px; font-size: 13px; line-height: 20px; box-shadow: var(--dsw-shadow-lv3); max-width: 70vw; }
.dshdx-hidden { display: none !important; }
`

/** Desktop sections appended after the official ones, in this order. Since
 * 1.4.0 the official engine covers multimodal and third-party provider
 * configuration natively (official "模型" section speaks openai-completions
 * AND anthropic-messages), so the former "模型与多模态" desktop section is
 * gone — providers, keys, and image-input declarations all live on the
 * official Models page now. */
const SECTION_DEFS = [
  { id: 'desktop-service', label: '内置服务', icon: ICONS.settings },
  { id: 'desktop-usage', label: '账户与用量', icon: ICONS.usage },
  { id: 'desktop-skills', label: 'Skill 加载器', icon: ICONS.skill },
  { id: 'desktop-mcp', label: 'MCP 插件', icon: ICONS.plugins },
  { id: 'desktop-update', label: '更新与关于', icon: ICONS.download },
]

/** Initialize the official-settings integration. @param ipcRenderer - Electron ipcRenderer. */
function init(ipcRenderer) {
  // webUtils resolves dropped/picked File objects to absolute paths (Electron ≥29).
  let webUtils = null
  try { ({ webUtils } = require('electron')) } catch { /* not in a preload context */ }
  const stylesheet = new CSSStyleSheet()
  stylesheet.replaceSync(CSS)

  const call = (channel, payload) => ipcRenderer.invoke(channel, payload)
  let toastTimer = null
  let toastEl = null

  function toast(message, isError = false) {
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement('div')
      toastEl.className = 'dshdx-toast'
      document.documentElement.appendChild(toastEl)
    }
    toastEl.textContent = message
    toastEl.classList.toggle('dshdx-hidden', false)
    toastEl.style.color = isError ? 'var(--dsw-alias-state-error-primary)' : ''
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.add('dshdx-hidden'), 3200)
  }
  async function safely(channel, payload) {
    try { return await call(channel, payload) } catch (error) { toast(error.message ?? String(error), true); throw error }
  }

  /* ---------- tiny DOM builder on official design tokens ---------- */
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value
      else if (key === 'text') node.textContent = value
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
      else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value)
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    }
    return node
  }
  const btn = (label, kind, onClick, small) => el('button', { type: 'button', class: `dshdx-btn ${kind ? `dshdx-btn-${kind}` : ''} ${small ? 'dshdx-btn-sm' : ''}`, text: label, onclick: onClick })
  // DOM 的 replaceChildren() 会把 null 参数转成字符串 "null" 渲染出来
  // （条件节点列表的常见坑），这里统一过滤后再调用。
  const setChildren = (host, ...kids) => {
    host.replaceChildren(...kids.flat().filter((k) => k instanceof Node))
  }
  const field = (labelText, control) => el('div', { class: 'dshdx-field' }, el('span', { class: 'dshdx-fieldlabel', text: labelText }), control)
  const input = (attrs = {}) => el('input', { class: 'dshdx-input', ...attrs })
  const switchRow = (labelText, checked, onChange) => {
    const box = el('input', { type: 'checkbox', class: 'dshdx-switch' })
    box.checked = Boolean(checked)
    box.addEventListener('change', () => onChange(box.checked))
    return el('label', { class: 'dshdx-switchrow' }, box, el('span', { text: labelText }))
  }
  const tag = (text, kind = '') => el('span', { class: `dshdx-tag ${kind}`, text })

  /* ---------- integration state ---------- */
  const state = {
    dialog: null, navList: null, options: null, rows: [],
    baseClasses: '', activeClasses: [], iconClass: '', labelClass: '',
    activeSection: null, sectionHost: null, hiddenOfficial: [],
    observer: null,
  }

  /** Locate the official settings dialog among mounted modals. */
  function findSettingsDialog() {
    for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
      const nav = dialog.querySelector('nav')
      if (!nav) continue
      const buttons = nav.querySelectorAll('button')
      if (buttons.length >= 2) return dialog
    }
    return null
  }

  /** Read the hashed CSS-module class names from live official cells. */
  function learnClasses() {
    const officialButtons = [...state.navList.querySelectorAll('button')].filter((button) => !button.hasAttribute('data-dshdx'))
    const activeButton = officialButtons.find((button) => button.getAttribute('aria-current') === 'true') ?? officialButtons[0]
    const plainButton = officialButtons.find((button) => button !== activeButton) ?? officialButtons[0]
    if (!activeButton || !plainButton) return false
    const plainSet = new Set(plainButton.className.split(/\s+/).filter(Boolean))
    state.activeClasses = activeButton.className.split(/\s+/).filter((name) => name && !plainSet.has(name))
    state.baseClasses = [...plainSet].join(' ')
    const iconNode = plainButton.querySelector('svg')
    state.iconClass = iconNode ? iconNode.getAttribute('class') ?? '' : ''
    const labelNode = plainButton.querySelector('span')
    state.labelClass = labelNode ? labelNode.getAttribute('class') ?? '' : ''
    return true
  }

  /** Build one desktop nav row that is class-identical to official cells. */
  function buildRow(def) {
    const row = el('button', { type: 'button', class: state.baseClasses, 'data-dshdx': def.id, 'aria-haspopup': 'false' })
    row.appendChild(navIconSvg(def.icon, state.iconClass))
    row.appendChild(el('span', { class: state.labelClass, text: def.label }))
    row.addEventListener('click', () => activate(def.id))
    return row
  }

  /** Show a desktop section: mark its row, hide the official one's content. */
  function activate(id) {
    if (state.activeSection === id) return
    deactivate()
    const def = SECTION_DEFS.find((item) => item.id === id)
    if (!def || !state.options) return
    state.activeSection = id
    for (const row of state.rows) {
      const isActive = row.getAttribute('data-dshdx') === id
      for (const name of state.activeClasses) row.classList.toggle(name, isActive)
      if (isActive) row.setAttribute('aria-current', 'true')
      else row.removeAttribute('aria-current')
    }
    for (const official of [...state.navList.querySelectorAll('button')]) {
      if (official.hasAttribute('data-dshdx')) continue
      for (const name of state.activeClasses) official.classList.remove(name)
      official.removeAttribute('aria-current')
    }
    state.hiddenOfficial = [...state.options.children].filter((child) => child !== state.sectionHost)
    for (const child of state.hiddenOfficial) child.style.display = 'none'
    state.sectionHost.className = 'dshdx-section'
    state.sectionHost.replaceChildren(SECTION_BUILDERS[id]())
    state.sectionHost.style.display = ''
    state.options.scrollTop = 0
  }

  /** Return to the official section content. */
  function deactivate() {
    if (state.activeSection === null) return
    state.activeSection = null
    for (const child of state.hiddenOfficial) child.style.display = ''
    state.hiddenOfficial = []
    if (state.sectionHost) state.sectionHost.style.display = 'none'
    for (const row of state.rows) {
      for (const name of state.activeClasses) row.classList.remove(name)
      row.removeAttribute('aria-current')
    }
  }

  /** Append desktop rows + section host to a freshly opened official panel. */
  function injectIntoPanel(dialog) {
    const nav = dialog.querySelector('nav')
    if (!nav) return
    const candidate = [...nav.children].filter((child) => child.querySelector?.('button'))
    state.navList = candidate.sort((a, b) => b.querySelectorAll('button').length - a.querySelectorAll('button').length)[0] ?? nav
    if (!state.navList || state.navList.querySelectorAll('button').length < 2) return
    if (!learnClasses()) return

    const panelDiv = nav.parentElement ?? dialog
    const contentDiv = [...panelDiv.children].find((child) => child !== nav)
    state.options = contentDiv ? contentDiv.lastElementChild : null
    if (!state.options) return

    state.dialog = dialog
    state.rows = SECTION_DEFS.map((def) => {
      const row = buildRow(def)
      state.navList.appendChild(row)
      return row
    })
    state.sectionHost = el('div', { class: 'dshdx-section' })
    state.sectionHost.style.display = 'none'
    state.options.appendChild(state.sectionHost)

    // Official row clicks (React-managed) must restore official content first.
    state.navList.addEventListener('click', (event) => {
      const button = event.target.closest('button')
      if (button && !button.hasAttribute('data-dshdx')) deactivate()
    }, true)
  }

  /** Drop integration references once the panel unmounts. */
  function releasePanel() {
    state.dialog = null
    state.navList = null
    state.options = null
    state.rows = []
    state.sectionHost = null
    state.activeSection = null
    state.hiddenOfficial = []
  }

  /** Adopt styles once a document exists; re-check as the SPA replaces body. */
  const adoptStyles = () => {
    if (!document.adoptedStyleSheets.includes(stylesheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet]
    }
  }

  function scan() {
    adoptStyles()
    const dialog = findSettingsDialog()
    if (dialog && dialog !== state.dialog) {
      releasePanel()
      injectIntoPanel(dialog)
    } else if (dialog && state.rows.length > 0 && !state.rows[0].isConnected) {
      // Same dialog element, but an official re-render (e.g. theme switch)
      // dropped the injected rows — inject again instead of staying blank.
      releasePanel()
      injectIntoPanel(dialog)
    } else if (!dialog && state.dialog) {
      releasePanel()
    }
  }

  const start = () => {
    adoptStyles()
    scan()
    state.observer = new MutationObserver(() => scan())
    state.observer.observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.documentElement) start()
  else document.addEventListener('DOMContentLoaded', start)

  // Tray / loading-page "settings" command: click the official trigger itself.
  ipcRenderer.on('desktop:toggle-control', () => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]')
    trigger?.click()
  })

  /* ======================================================================
   * Section builders — official settings-panel design language.
   * ==================================================================== */

  const STATUS_META = {
    stopped: ['已停止', ''], starting: ['启动中…', 'busy'], 'running-managed': ['运行中（托管）', 'ok'],
    'running-external': ['运行中（外部服务）', 'ok'], stopping: ['停止中…', 'busy'], error: ['异常', 'err'],
  }
  let serviceVersionsText = ''
  let serviceStatusListener = null
  let progressListener = null
  let skillsChangedListener = null

  function buildServiceSection() {
    const root = el('div')
    const statusCard = el('div', { class: 'dshdx-card' })
    let statusNow = null
    const refreshButtons = () => {
      const running = statusNow !== null && (statusNow.status === 'running-managed' || statusNow.status === 'running-external')
      for (const [selector, disabled] of [['[data-dshdx-start]', running], ['[data-dshdx-stop]', statusNow?.status !== 'running-managed'], ['[data-dshdx-restart]', !running]]) {
        const node = root.querySelector(selector)
        if (node) node.disabled = Boolean(disabled)
      }
    }
    const paint = (status) => {
      statusNow = status
      const [label, dotKind] = STATUS_META[status.status] ?? [status.status, '']
      setChildren(statusCard,
        el('div', { class: 'dshdx-rowline' }, el('span', { class: `dshdx-dot ${dotKind ? `dshdx-dot-${dotKind}` : ''}` }), el('span', { class: 'dshdx-cardtitle', text: `内置服务：${label}` })),
        el('p', { class: 'dshdx-sub', text: status.detail || '' }),
        el('p', { class: 'dshdx-caption', text: `来源：${status.source ?? '—'}　PID：${status.pid ?? '—'}　启动时间：${status.startedAt ? new Date(status.startedAt).toLocaleString() : '—'}` }),
        serviceVersionsText ? el('p', { class: 'dshdx-caption', text: `可用来源：${serviceVersionsText}` }) : null,
      )
      refreshButtons()
    }

    // One page-level status listener at a time; rebuilds replace the previous.
    // ipcRenderer.on() returns ipcRenderer itself, NOT an unsubscribe function —
    // keep the listener reference and remove it explicitly, otherwise the second
    // build throws and the whole section fails to render.
    if (serviceStatusListener) serviceStatusListener()
    const listener = (_event, payload) => {
      if (statusCard.isConnected) paint(payload)
    }
    ipcRenderer.on('service:status', listener)
    serviceStatusListener = () => ipcRenderer.removeListener('service:status', listener)
    call('service:status').then(paint).catch(() => {})

    /* Service source / address / behavior form (saves per change). */
    const modeSelect = el('select', { class: 'dshdx-select' },
      el('option', { value: 'auto', text: '自动（本地更新版 → 内置 → 源码 → 全局 → npx）' }),
      el('option', { value: 'updated', text: '本地更新版（一键更新的安装位置）' }),
      el('option', { value: 'bundled', text: '内置服务（随应用打包，免 Node.js）' }),
      el('option', { value: 'source', text: '本地源码仓库' }),
      el('option', { value: 'global', text: '全局安装的 dsh' }),
      el('option', { value: 'npx', text: 'npx 自动安装（始终最新版）' }),
    )
    const repoInput = input({ type: 'text', placeholder: '本地 deepseek-harness 仓库路径' })
    const pickRepo = btn('浏览…', 'secondary', async () => {
      const folder = await safely('dialog:pickFolder')
      if (folder) { repoInput.value = folder; repoInput.dispatchEvent(new Event('change')) }
    }, true)
    const originInput = input({ type: 'text', placeholder: 'http://127.0.0.1:3080' })
    const workspaceInput = input({ type: 'text', placeholder: '留空则仅扫描用户级 Skill 根目录' })
    const pickWorkspace = btn('浏览…', 'secondary', async () => {
      const folder = await safely('dialog:pickFolder')
      if (folder) { workspaceInput.value = folder; workspaceInput.dispatchEvent(new Event('change')) }
    }, true)
    const switches = {
      autoStartService: switchRow('启动应用时自动启动 / 唤醒服务', false, async (checked) => { await safely('settings:set', { autoStartService: checked }); toast('设置已保存') }),
      stopServiceOnQuit: switchRow('退出应用时停止托管的服务', false, async (checked) => { await safely('settings:set', { stopServiceOnQuit: checked }); toast('设置已保存') }),
      closeToTray: switchRow('关闭窗口时最小化到托盘', false, async (checked) => { await safely('settings:set', { closeToTray: checked }); toast('设置已保存') }),
      launchOnLogin: switchRow('开机自动启动', false, async (checked) => { await safely('settings:set', { launchOnLogin: checked }); toast('设置已保存') }),
    }
    call('settings:get').then((settings) => {
      modeSelect.value = settings.serviceMode ?? 'auto'
      repoInput.value = settings.sourceRepoPath ?? ''
      originInput.value = settings.origin ?? ''
      workspaceInput.value = settings.workspacePath ?? ''
      switches.autoStartService.querySelector('input').checked = Boolean(settings.autoStartService)
      switches.stopServiceOnQuit.querySelector('input').checked = Boolean(settings.stopServiceOnQuit)
      switches.closeToTray.querySelector('input').checked = Boolean(settings.closeToTray)
      switches.launchOnLogin.querySelector('input').checked = Boolean(settings.launchOnLogin)
    }).catch(() => {})
    modeSelect.addEventListener('change', async () => { await safely('settings:set', { serviceMode: modeSelect.value }); toast('设置已保存') })
    repoInput.addEventListener('change', async () => { await safely('settings:set', { sourceRepoPath: repoInput.value.trim() }); toast('设置已保存') })
    originInput.addEventListener('change', async () => { await safely('settings:set', { origin: originInput.value.trim() }); toast('设置已保存') })
    workspaceInput.addEventListener('change', async () => { await safely('settings:set', { workspacePath: workspaceInput.value.trim() }); toast('设置已保存') })

    root.replaceChildren(
      el('h3', { class: 'dshdx-title', text: '内置服务' }),
      el('p', { class: 'dshdx-intro', text: '桌面应用自动启动并管理本地 DeepSeek Harness 服务；已在运行的服务会被直接唤醒复用。' }),
      statusCard,
      el('div', { class: 'dshdx-card' },
        el('span', { class: 'dshdx-cardtitle', text: '操作' }),
        el('div', { class: 'dshdx-cardactions' },
          (() => { const node = btn('启动服务', 'primary', () => safely('service:start').then(paint).catch(() => {})); node.setAttribute('data-dshdx-start', ''); return node })(),
          (() => { const node = btn('停止服务', 'secondary', () => safely('service:stop').then(paint).catch(() => {})); node.setAttribute('data-dshdx-stop', ''); return node })(),
          (() => { const node = btn('重启服务', 'secondary', () => safely('service:restart').then(paint).catch(() => {})); node.setAttribute('data-dshdx-restart', ''); return node })(),
          btn('查看日志', 'secondary', showLogs),
          btn('在浏览器中打开', 'secondary', async () => { const settings = await safely('settings:get'); call('shell:openExternal', settings.origin) }),
        ),
      ),
      el('div', { class: 'dshdx-card' },
        el('span', { class: 'dshdx-cardtitle', text: '服务来源与地址' }),
        field('服务来源', modeSelect),
        field('源码仓库路径（源码模式 / 自动探测失败时填写）', el('div', { class: 'dshdx-inputrow' }, repoInput, pickRepo)),
        field('Web 服务地址', originInput),
        field('工作区路径（用于项目级 Skill 根目录）', el('div', { class: 'dshdx-inputrow' }, workspaceInput, pickWorkspace)),
      ),
      el('div', { class: 'dshdx-card' },
        el('span', { class: 'dshdx-cardtitle', text: '行为开关' }),
        switches.autoStartService, switches.stopServiceOnQuit, switches.closeToTray, switches.launchOnLogin,
      ),
    )
    return root
  }

  function showLogs() {
    safely('service:logs').then((logs) => {
      const mask = el('div', { class: 'dshdx-logsmask' })
      const close = () => mask.remove()
      mask.appendChild(el('div', { class: 'dshdx-logspanel' },
        el('div', { class: 'dshdx-rowline' }, el('span', { class: 'dshdx-cardtitle', text: '服务日志（最近 500 行）' }), (() => { const spacer = el('span'); spacer.style.marginLeft = 'auto'; return spacer })(), btn('关闭', 'secondary', close, true)),
        el('pre', { class: 'dshdx-logspre', text: logs.length > 0 ? logs.join('\n') : '（暂无日志）' }),
      ))
      mask.addEventListener('click', (event) => { if (event.target === mask) close() })
      document.addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { close(); document.removeEventListener('keydown', onKey) } })
      document.documentElement.appendChild(mask)
    }).catch(() => {})
  }

  function buildSkillsSection() {
    const root = el('div')
    const listHost = el('div', { class: 'dshdx-stack' })
    const rootSelect = el('select', { class: 'dshdx-select' })
    const kindSelect = el('select', { class: 'dshdx-select' },
      el('option', { value: 'git', text: 'Git 仓库（支持根目录 SKILL.md 或 skills/<名称>/SKILL.md 布局）' }),
      el('option', { value: 'folder', text: '本地文件夹（根目录需含 SKILL.md）' }),
      el('option', { value: 'file', text: '单个 .md 文件 URL' }),
    )
    const refInput = input({ type: 'text', placeholder: 'https://github.com/user/skill-repo 或本地路径' })
    const pickButton = btn('选择文件夹…', 'secondary', async () => {
      const folder = await safely('dialog:pickFolder')
      if (folder) refInput.value = folder
    }, true)
    pickButton.classList.add('dshdx-hidden')
    kindSelect.addEventListener('change', () => pickButton.classList.toggle('dshdx-hidden', kindSelect.value !== 'folder'))
    const searchInput = input({ type: 'search', placeholder: '搜索名称 / 描述…' })
    searchInput.className = 'dshdx-input dshdx-search'
    let skillsData = { roots: [], items: [], official: { available: false, error: null } }

    /* ---- GitHub skill search (v1.3) ---- */
    const ghQuery = input({ type: 'search', placeholder: '例如：pdf、commit、frontend…' })
    const ghResults = el('div', { class: 'dshdx-stack' })
    const ghSearch = async () => {
      ghResults.replaceChildren(el('p', { class: 'dshdx-caption', text: '正在搜索 GitHub…' }))
      try {
        const results = await call('skills:searchGitHub', { query: ghQuery.value })
        ghResults.replaceChildren(...(results.length === 0
          ? [el('p', { class: 'dshdx-caption', text: '没有找到相关仓库。' })]
          : results.map((item) => el('div', { class: 'dshdx-card' },
              el('div', { class: 'dshdx-cardhead' },
                el('span', { class: 'dshdx-cardtitle', text: item.fullName }),
                tag(`${item.stars} ★`),
                el('span', { class: 'dshdx-cardactions' },
                  btn('查看', 'secondary', () => call('shell:openExternal', item.url), true),
                  btn('安装', 'primary', async () => {
                    try {
                      const result = await safely('skills:install', { kind: 'git', ref: item.cloneUrl, rootId: rootSelect.value })
                      paintSkills(await call('skills:listMerged').catch(() => skillsData))
                      toast(`安装成功：${result.installed.join('、')}`)
                    } catch { /* safely already toasted */ }
                  }, true),
                ),
              ),
              item.description ? el('p', { class: 'dshdx-caption', text: item.description }) : null,
            ))))
      } catch { /* safely already toasted */ ghResults.replaceChildren() }
    }

    /* ---- Drag-drop / upload install (v1.3) ---- */
    const dropZone = el('div', { class: 'dshdx-card', style: 'border-style:dashed; align-items:center; text-align:center; gap:6px; padding:18px;' },
      el('span', { class: 'dshdx-cardtitle', text: '拖拽安装' }),
      el('p', { class: 'dshdx-caption', text: '把 Skill 文件夹、单个 .md 文件或 .zip/.tgz 压缩包拖到这里，即可安装到下方选中的根目录。' }),
      btn('选择文件上传…', 'secondary', () => filePicker.click(), true),
    )
    const filePicker = el('input', { type: 'file', multiple: true, style: 'display:none', accept: '.md,.zip,.tgz,.tar.gz' })
    const installFileList = async (files) => {
      if (!webUtils) { toast('当前环境不支持路径解析，请改用「本地文件夹」安装', true); return }
      const paths = [...files].map((file) => webUtils.getPathForFile(file)).filter((item) => item !== '')
      if (paths.length === 0) return
      try {
        const result = await safely('skills:installPaths', { paths, rootId: rootSelect.value })
        paintSkills(await call('skills:listMerged').catch(() => skillsData))
        if (result.installed.length > 0) toast(`安装成功：${result.installed.join('、')}`)
        if (result.errors?.length > 0) toast(result.errors[0], true)
      } catch { /* safely already toasted */ }
    }
    ghQuery.addEventListener('keydown', (event) => { if (event.key === 'Enter') ghSearch() })
    filePicker.addEventListener('change', () => { installFileList(filePicker.files); filePicker.value = '' })
    dropZone.addEventListener('dragover', (event) => { event.preventDefault(); event.stopPropagation(); dropZone.style.borderColor = 'var(--dsw-alias-border-activated)' })
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '' })
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault()
      event.stopPropagation()
      dropZone.style.borderColor = ''
      installFileList(event.dataTransfer.files)
    })

    const paintItems = () => {
      const keyword = searchInput.value.trim().toLowerCase()
      const items = skillsData.items.filter((item) => keyword === '' || item.name.toLowerCase().includes(keyword) || (item.description ?? '').toLowerCase().includes(keyword))
      listHost.replaceChildren(...(items.length === 0
        ? [el('p', { class: 'dshdx-caption', text: '没有匹配的 Skill。' })]
        : items.map((item) => item.readOnly
            ? el('div', { class: 'dshdx-card' },
                el('div', { class: 'dshdx-cardhead' },
                  el('span', { class: 'dshdx-cardtitle', text: item.name }),
                  tag(`${item.rootLabel} · rank ${item.rank}`),
                  tag('官方内置 · 只读', 'dshdx-tag-warn'),
                  item.modelInvocable ? tag('模型可调用', 'dshdx-tag-ok') : tag('仅用户调用', 'dshdx-tag-warn'),
                ),
                item.description ? el('p', { class: 'dshdx-caption', text: item.description }) : null,
                el('p', { class: 'dshdx-caption', text: '由引擎或插件捆绑提供，已在会话 / 菜单中生效。如需定制，在任一本地根目录创建同名 Skill 即可覆盖（本地 rank 更高）。' }),
              )
            : el('div', { class: 'dshdx-card' },
                el('div', { class: 'dshdx-cardhead' },
                  el('span', { class: 'dshdx-cardtitle', text: item.name }),
                  tag(`${item.rootLabel} · rank ${item.rank}`),
                  tag(item.isBundle ? '目录包' : '单文件'),
                  item.modelInvocable ? tag('模型可调用', 'dshdx-tag-ok') : tag('已停用', 'dshdx-tag-warn'),
                  el('span', { class: 'dshdx-cardactions' },
                    btn('打开位置', 'secondary', () => {
                      const target = item.path
                      const dir = target.endsWith('SKILL.md') ? target.slice(0, -'SKILL.md'.length) : target.replace(/[^/\\]+$/, '')
                      call('shell:openPath', dir)
                    }, true),
                    btn('删除', 'danger', async () => {
                      if (!window.confirm(`确定删除技能 "${item.name}"？`)) return
                      await safely('skills:remove', item.path)
                      paintSkills(await call('skills:listMerged').catch(() => skillsData))
                    }, true),
                  ),
                ),
                item.description ? el('p', { class: 'dshdx-caption', text: item.description }) : null,
                item.shadowedBy ? el('p', { class: 'dshdx-issue', text: `被 ${item.shadowedBy} 中的同名技能遮蔽，当前不生效。` }) : null,
                ...item.issues.map((issue) => el('p', { class: 'dshdx-issue', text: issue })),
                (skillsData.official?.available && !item.shadowedBy && item.inOfficialCatalog === false && item.issues.length === 0)
                  ? el('p', { class: 'dshdx-caption', text: '尚未出现在官方目录中；若刚修改过，重启服务后生效。' })
                  : null,
                el('p', { class: 'dshdx-path', text: item.path }),
              ))))
    }
    const officialStatusHost = el('p', { class: 'dshdx-caption', style: 'display:none' })
    const paintSkills = (data) => {
      skillsData = data
      rootSelect.replaceChildren(...data.roots.map((skillRoot) => el('option', { value: skillRoot.id, text: `${skillRoot.label}${skillRoot.exists ? '' : '（不存在，安装时创建）'}` })))
      if (data.official?.available === false && data.official?.error) {
        officialStatusHost.textContent = `官方目录未连接（${data.official.error}）；当前仅展示本地扫描结果。`
        officialStatusHost.style.display = ''
      } else if (data.official?.available === true) {
        const bundledCount = data.items.filter((item) => item.readOnly).length
        officialStatusHost.textContent = `官方目录已连接，与会话 / 菜单一致（含 ${bundledCount} 个引擎/插件内置 Skill）。`
        officialStatusHost.style.display = ''
      } else {
        officialStatusHost.style.display = 'none'
      }
      paintItems()
    }
    call('skills:listMerged').then(paintSkills).catch(() => call('skills:list').then(paintSkills).catch(() => {}))
    if (skillsChangedListener) skillsChangedListener()
    const onSkillsChanged = () => { if (listHost.isConnected) call('skills:listMerged').then(paintSkills).catch(() => {}) }
    ipcRenderer.on('skills:changed', onSkillsChanged)
    skillsChangedListener = () => ipcRenderer.removeListener('skills:changed', onSkillsChanged)

    root.replaceChildren(
      el('h3', { class: 'dshdx-title', text: 'Skill 加载器' }),
      el('p', { class: 'dshdx-intro', text: '与官方插件系统共用同一套目录与优先级（项目 .dsh/.agents → 用户 ~/.dsh/.agents → 官方内置 rank 600），不会冲突：本地扫描结果会与运行中的官方目录比对，引擎/插件捆绑的 Skill 以只读形式一并展示，与会话 / 菜单保持一致。' }),
      officialStatusHost,
      el('div', { class: 'dshdx-card' },
        el('span', { class: 'dshdx-cardtitle', text: '安装 Skill' }),
        field('来源', kindSelect),
        field('地址 / 路径', el('div', { class: 'dshdx-inputrow' }, refInput, pickButton)),
        field('安装到', rootSelect),
        el('div', { class: 'dshdx-cardactions' }, btn('安装', 'primary', async () => {
          if (refInput.value.trim() === '') { toast('请填写来源地址', true); return }
          const result = await safely('skills:install', { kind: kindSelect.value, ref: refInput.value.trim(), rootId: rootSelect.value })
          paintSkills(await call('skills:listMerged').catch(() => skillsData))
          toast(`安装成功：${result.installed.join('、')}`)
        })),
      ),
      el('div', { class: 'dshdx-card' },
        el('span', { class: 'dshdx-cardtitle', text: '从 GitHub 搜索 Skill' }),
        el('div', { class: 'dshdx-inputrow' }, ghQuery, btn('搜索', 'secondary', ghSearch, true)),
        ghResults,
      ),
      dropZone,
      filePicker,
      el('div', { class: 'dshdx-card' },
        el('div', { class: 'dshdx-cardhead' }, el('span', { class: 'dshdx-cardtitle', text: `已发现 ${skillsData.items.length} 个` }), searchInput),
        listHost,
      ),
    )
    return root
  }

  function buildMcpSection() {
    const root = el('div')
    const listHost = el('div', { class: 'dshdx-stack' })
    const editorHost = el('div')
    let mcpState = { servers: [] }

    const paint = (data) => {
      mcpState = data
      listHost.replaceChildren(...(data.servers.length === 0
        ? [el('p', { class: 'dshdx-caption', text: '尚未配置 MCP 服务器。添加后以官方 mcp-client 插件注入，模型可直接调用其工具（mcp__<名称>__<工具>）。' })]
        : data.servers.map((server) => {
            const resultLine = el('p', { class: 'dshdx-caption' })
            const testButton = btn('测试连接', 'secondary', async () => {
              testButton.disabled = true
              resultLine.textContent = '正在连接…'
              try {
                const result = await safely('mcp:test', server.id)
                if (result.ok) {
                  const who = result.serverInfo?.name ? `（${result.serverInfo.name}${result.serverInfo.version ? ` ${result.serverInfo.version}` : ''}）` : ''
                  resultLine.textContent = `连接成功${who}：${result.tools === null ? (result.note ?? '工具数未知') : `${result.tools} 个工具${result.toolNames?.length ? `：${result.toolNames.join('、')}` : ''}`}`
                  resultLine.style.color = 'var(--dsw-alias-state-success-primary)'
                } else {
                  resultLine.textContent = `连接失败：${result.error}`
                  resultLine.style.color = 'var(--dsw-alias-state-error-primary)'
                }
              } finally {
                testButton.disabled = false
              }
            }, true)
            return el('div', { class: 'dshdx-card' },
              el('div', { class: 'dshdx-cardhead' },
                el('span', { class: 'dshdx-cardtitle', text: `mcp__${server.name}` }),
                tag(server.transport === 'stdio' ? 'stdio' : 'streamable-http'),
                server.enabled ? tag('已启用', 'dshdx-tag-ok') : tag('已停用'),
                el('span', { class: 'dshdx-cardactions' },
                  testButton,
                  btn('编辑', 'secondary', () => editorHost.replaceChildren(buildMcpEditor(server, paint, editorHost)), true),
                  btn('删除', 'danger', async () => {
                    if (!window.confirm('确定删除该 MCP 服务器？')) return
                    paint(await safely('mcp:remove', server.id))
                  }, true),
                ),
              ),
              el('p', { class: 'dshdx-caption', text: server.transport === 'stdio' ? server.command : server.url }),
              resultLine,
            )
          })))
    }
    call('mcp:state').then(paint).catch(() => {})

    root.replaceChildren(
      el('h3', { class: 'dshdx-title', text: 'MCP 插件' }),
      el('p', { class: 'dshdx-intro', text: '官方目前没有 MCP 可视化配置界面，本面板是其补充：通过官方 @deepseek-ai/dsh-mcp-client 插件接入外部 MCP 服务器，配置写入注入层并以 --patch 参数启动服务，不改动任何官方 profile 文件，与官方插件清单一栏互不影响。保存后需重启服务生效。' }),
      listHost,
      editorHost,
      el('div', { class: 'dshdx-cardactions' },
        btn('添加 MCP 服务器', 'primary', () => editorHost.replaceChildren(buildMcpEditor(null, paint, editorHost))),
        btn('重启服务以应用', 'secondary', () => { toast('正在重启服务以应用 MCP 注入层…'); safely('service:restart').catch(() => {}) }),
      ),
    )
    return root
  }

  function kvRows(titleText, entries) {
    const host = el('div', { class: 'dshdx-stack' })
    const addRow = (key = '', value = '') => {
      const keyInput = input({ type: 'text', placeholder: '名称', value: key })
      const valueInput = input({ type: 'text', placeholder: '值', value })
      const row = el('div', { class: 'dshdx-kvrow' }, keyInput, valueInput, btn('移除', 'danger', () => row.remove(), true))
      host.appendChild(row)
    }
    for (const [key, value] of Object.entries(entries ?? {})) addRow(key, value)
    return { field: field(titleText, el('div', {}, host, btn('添加一项', 'secondary', () => addRow(), true))), host }
  }

  function buildMcpEditor(server, paint, editorHost) {
    const isNew = server === null
    const draft = isNew
      ? { name: '', transport: 'stdio', command: '', args: [], env: {}, url: '', headers: {}, toolCallTimeoutMs: 60000, failOnStartupError: false, reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 } }
      : JSON.parse(JSON.stringify(server))
    const nameInput = input({ type: 'text', value: draft.name, placeholder: 'github' })
    const transportSelect = el('select', { class: 'dshdx-select' },
      el('option', { value: 'stdio', text: 'stdio（本地命令）' }),
      el('option', { value: 'streamable-http', text: 'streamable-http（远程 URL）' }),
    )
    transportSelect.value = draft.transport
    const timeoutInput = input({ type: 'number', value: draft.toolCallTimeoutMs })
    const failBox = el('input', { type: 'checkbox', class: 'dshdx-switch' })
    failBox.checked = draft.failOnStartupError
    const reconnectBox = el('input', { type: 'checkbox', class: 'dshdx-switch' })
    reconnectBox.checked = draft.reconnect?.enabled !== false
    const delayInput = input({ type: 'number', value: draft.reconnect?.initialDelayMs ?? 500 })
    const maxDelayInput = input({ type: 'number', value: draft.reconnect?.maxDelayMs ?? 30000 })
    const attemptsInput = input({ type: 'number', value: draft.reconnect?.maxAttempts ?? 10 })

    const transportHost = el('div')
    const envRows = { host: null }
    const headerRows = { host: null }
    const renderTransport = () => {
      const isStdio = transportSelect.value === 'stdio'
      if (isStdio) {
        const commandInput = input({ type: 'text', value: draft.command ?? '', placeholder: 'npx' })
        const argsArea = el('textarea', { class: 'dshdx-textarea', rows: '3' })
        argsArea.value = (draft.args ?? []).join('\n')
        const cwdInput = input({ type: 'text', value: draft.cwd ?? '' })
        const envField = kvRows('环境变量', draft.env)
        envRows.host = envField.host
        transportHost.replaceChildren(
          field('可执行命令', commandInput), field('参数（每行一个）', argsArea), envField.field, field('工作目录（可选）', cwdInput),
        )
        transportHost.collect = () => ({
          command: commandInput.value, args: argsArea.value, cwd: cwdInput.value,
          env: Object.fromEntries([...envRows.host.children].map((row) => [row.querySelector('.dshdx-input').value.trim(), [...row.querySelectorAll('.dshdx-input')][1].value]).filter(([key]) => key !== '')),
        })
      } else {
        const urlInput = input({ type: 'text', value: draft.url ?? '', placeholder: 'http://localhost:3000/mcp' })
        const headerField = kvRows('附加请求头', draft.headers)
        headerRows.host = headerField.host
        transportHost.replaceChildren(field('MCP 服务器 URL', urlInput), headerField.field)
        transportHost.collect = () => ({
          url: urlInput.value,
          headers: Object.fromEntries([...headerRows.host.children].map((row) => [row.querySelector('.dshdx-input').value.trim(), [...row.querySelectorAll('.dshdx-input')][1].value]).filter(([key]) => key !== '')),
        })
      }
    }
    renderTransport()
    transportSelect.addEventListener('change', renderTransport)

    return el('div', { class: 'dshdx-editor' },
      el('div', { class: 'dshdx-cardhead' }, el('span', { class: 'dshdx-cardtitle', text: isNew ? '添加 MCP 服务器' : `编辑：${server.name}` })),
      field('服务器名称（工具命名空间）', nameInput),
      field('传输方式', transportSelect),
      transportHost,
      field('工具调用超时（毫秒）', timeoutInput),
      el('label', { class: 'dshdx-switchrow' }, failBox, el('span', { text: '连接或工具同步失败时视为启动错误' })),
      el('label', { class: 'dshdx-switchrow' }, reconnectBox, el('span', { text: '断线自动重连（指数退避）' })),
      el('div', { class: 'dshdx-inputrow' }, field('首次重连延迟（毫秒）', delayInput), field('退避上限（毫秒）', maxDelayInput), field('最大尝试次数', attemptsInput)),
      el('div', { class: 'dshdx-cardactions' },
        btn('保存并写入注入层', 'primary', async () => {
          const transport = transportHost.collect()
          paint(await safely('mcp:save', {
            id: isNew ? '' : server.id, name: nameInput.value.trim(), transport: transportSelect.value,
            toolCallTimeoutMs: Number(timeoutInput.value) || 60000, failOnStartupError: failBox.checked,
            reconnect: { enabled: reconnectBox.checked, initialDelayMs: Number(delayInput.value) || 500, maxDelayMs: Number(maxDelayInput.value) || 30000, maxAttempts: Number(attemptsInput.value) || 10 },
            ...transport,
          }))
          editorHost.replaceChildren()
          toast('已写入注入层，重启服务后生效')
        }),
        btn('取消', 'secondary', () => editorHost.replaceChildren()),
      ),
    )
  }

  function buildUsageSection() {
    const root = el('div')
    const balanceHost = el('div', { class: 'dshdx-stack' })
    const officialHost = el('div', { class: 'dshdx-stack' })

    const fmtTokens = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : n >= 1000 ? `${(n / 1000).toFixed(1)} K` : String(n)
    const officialSumRow = (label, data) => el('div', { class: 'dshdx-card', style: 'flex:1' },
      el('span', { class: 'dshdx-caption', text: label }),
      el('div', { class: 'dshdx-rowline', style: 'justify-content:space-between' },
        el('span', { class: 'dshdx-cardtitle', text: `${fmtTokens(data.input + data.output)} tokens` }),
      ),
      el('span', { class: 'dshdx-caption', text: `${data.requests} 次请求 · 输入 ${fmtTokens(data.input)} · 输出 ${fmtTokens(data.output)}` }),
      (data.cacheRead > 0 || data.reasoning > 0)
        ? el('span', { class: 'dshdx-caption', text: `缓存命中 ${fmtTokens(data.cacheRead)} · 推理 ${fmtTokens(data.reasoning)}` })
        : null,
    )

    async function refreshBalances() {
      balanceHost.replaceChildren(el('p', { class: 'dshdx-caption', text: '正在查询各账户余额…' }))
      try {
        const rows = await call('balances:list')
        balanceHost.replaceChildren(...(rows.length === 0
          ? [el('p', { class: 'dshdx-caption', text: '尚未配置任何账户。请在官方「模型」板块填写 API Key。' })]
          : rows.map((row) => el('div', { class: 'dshdx-rowline' },
              el('span', { class: 'dshdx-cardtitle', text: row.displayName ?? row.id }),
              row.balance != null
                ? el('span', { class: 'dshdx-cardtitle', style: 'margin-left:auto', text: row.balance })
                : el('span', { class: 'dshdx-caption', style: 'margin-left:auto', text: row.note ?? '该服务商不支持余额查询' }),
            ))))
      } catch {
        balanceHost.replaceChildren(el('p', { class: 'dshdx-caption', text: '余额查询失败，请稍后重试。' }))
      }
    }

    async function refreshOfficial() {
      officialHost.replaceChildren(el('p', { class: 'dshdx-caption', text: '正在扫描官方会话日志…（首次扫描可能需要几秒）' }))
      try {
        const stats = await call('official-usage:stats')
        const blocks = [
          el('div', { class: 'dshdx-rowline', style: 'align-items:stretch' },
            officialSumRow('今日', stats.today), officialSumRow('近 7 日', stats.week), officialSumRow('累计', stats.total)),
        ]
        if (stats.catalog && stats.catalog.groups.length > 0) {
          blocks.push(el('div', { class: 'dshdx-card' },
            el('span', { class: 'dshdx-cardtitle', text: '官方模型目录用量' }),
            el('div', { class: 'dshdx-stack' }, stats.catalog.groups.map((group) => el('div', { class: 'dshdx-stack' },
              el('div', { class: 'dshdx-rowline' },
                el('span', { class: 'dshdx-sub', text: group.providerName }),
                tag(`${group.models.length} 个模型`),
              ),
              el('div', { class: 'dshdx-stack', style: 'padding-left:10px' }, group.models.map((model) => el('div', { class: 'dshdx-rowline' },
                el('span', { class: 'dshdx-caption', text: model.name === model.id ? model.id : `${model.name}（${model.id}）` }),
                el('span', { class: 'dshdx-caption', style: 'margin-left:auto', text: model.usage.requests === 0
                  ? '未使用'
                  : `${model.usage.requests} 次 · 输入 ${fmtTokens(model.usage.input)} · 输出 ${fmtTokens(model.usage.output)}` }),
              ))),
            ))),
            stats.catalog.failures.length > 0
              ? el('p', { class: 'dshdx-caption', text: `部分服务商目录加载失败：${stats.catalog.failures.join('；')}` })
              : null,
          ))
        }
        const offCatalog = stats.models.filter((m) => !stats.catalog || !m.inCatalog)
        if (stats.models.length > 0 && (stats.catalog === null || offCatalog.length > 0)) {
          const listed = stats.catalog === null ? stats.models : offCatalog
          blocks.push(el('div', { class: 'dshdx-card' },
            el('span', { class: 'dshdx-cardtitle', text: stats.catalog === null ? '按模型统计' : '其他模型（不在当前官方目录中）' }),
            el('div', { class: 'dshdx-stack' }, listed.map((m) => el('div', { class: 'dshdx-rowline' },
              el('span', { class: 'dshdx-sub', text: m.model }),
              el('span', { class: 'dshdx-caption', style: 'margin-left:auto', text: `${m.requests} 次 · 输入 ${fmtTokens(m.input)} · 输出 ${fmtTokens(m.output)}` }),
            ))),
          ))
        }
        blocks.push(el('div', { class: 'dshdx-card' },
          el('span', { class: 'dshdx-cardtitle', text: '最近请求' }),
          stats.recent.length === 0
            ? el('p', { class: 'dshdx-caption', text: '暂无记录。官方引擎处理请求后会话日志会写入 $DSH_HOME/sessions。' })
            : el('div', { class: 'dshdx-stack' }, stats.recent.slice(0, 10).map((r) => el('div', { class: 'dshdx-rowline' },
                el('span', { class: 'dshdx-caption', text: new Date(r.ts).toLocaleString() }),
                el('span', { class: 'dshdx-sub', text: r.provider ? `${r.provider} / ${r.model ?? ''}` : (r.model ?? '') }),
                el('span', { class: 'dshdx-caption', style: 'margin-left:auto', text: `输入 ${fmtTokens(r.inputTokens)} · 输出 ${fmtTokens(r.outputTokens)}` }),
              ))),
        ))
        officialHost.replaceChildren(...blocks)
      } catch (error) {
        officialHost.replaceChildren(el('p', { class: 'dshdx-caption', text: `官方用量读取失败：${error.message ?? error}` }))
      }
    }

    root.replaceChildren(
      el('h3', { class: 'dshdx-title', text: '账户与用量' }),
      el('p', { class: 'dshdx-intro', text: '直接读取官方引擎会话日志统计用量，覆盖官方「模型」板块中的全部可选模型（含第三方 Provider 路由）；余额按官方凭据层解析出的 API Key 查询 DeepSeek 账户。' }),
      el('div', { class: 'dshdx-card' },
        el('div', { class: 'dshdx-cardhead' },
          el('span', { class: 'dshdx-cardtitle', text: '账户余额' }),
          el('div', { class: 'dshdx-cardactions' }, btn('刷新余额', 'secondary', refreshBalances, true)),
        ),
        balanceHost,
        el('p', { class: 'dshdx-caption', text: '密钥统一在官方「模型」板块维护（写入 $DSH_HOME/.credentials.yaml），本面板只读查询。' }),
      ),
      el('div', { class: 'dshdx-card' },
        el('div', { class: 'dshdx-cardhead' },
          el('span', { class: 'dshdx-cardtitle', text: '官方引擎用量' }),
          el('div', { class: 'dshdx-cardactions' }, btn('刷新', 'secondary', refreshOfficial, true)),
        ),
        officialHost,
        el('p', { class: 'dshdx-caption', text: '数据来源：官方引擎会话日志（$DSH_HOME/sessions），覆盖官方「模型」板块中的所有可选模型，含 token 输入/输出、缓存命中与推理 token。' }),
      ),
    )
    refreshBalances()
    refreshOfficial()
    return root
  }

  function buildUpdateSection() {
    const root = el('div')
    const officialBody = el('div')
    const desktopBody = el('div')
    const progress = el('div', { class: 'dshdx-progress dshdx-hidden' })
    const applyButton = btn('一键更新官方引擎并重启服务', 'primary', async () => {
      applyButton.disabled = true
      progress.classList.remove('dshdx-hidden')
      progress.textContent = '开始一键更新官方引擎…\n'
      try {
        const result = await call('updates:applyOfficial')
        progress.textContent += `完成：官方引擎已更新到 ${result.latest}。\n`
        toast(`官方引擎已更新到 ${result.latest}`)
        if (window.confirm('官方引擎更新完成，是否立即重启服务以启用新版本？')) {
          await safely('service:restart').catch(() => {})
        }
      } catch (error) {
        progress.textContent += `失败：${error.message}\n`
        toast(`更新失败：${error.message}`, true)
      } finally {
        applyButton.disabled = false
      }
    })
    if (progressListener) progressListener()
    const onProgress = (_event, line) => {
      if (!progress.isConnected) return
      progress.classList.remove('dshdx-hidden')
      progress.textContent = `${progress.textContent}${line}\n`
      if (progress.textContent.length > 8000) progress.textContent = progress.textContent.slice(-8000)
      progress.scrollTop = progress.scrollHeight
    }
    ipcRenderer.on('updates:progress', onProgress)
    progressListener = () => ipcRenderer.removeListener('updates:progress', onProgress)

    const renderUpdates = (result) => {
      const official = result.official
      const mirror = result.mirror
      const mirrorDegraded = Boolean(mirror?.error) || Boolean(mirror?.activeUrl && mirror?.url && mirror.activeUrl !== mirror.url)
      setChildren(officialBody,
        el('div', { class: 'dshdx-rowline' },
          el('span', { text: `本地引擎：${official.installed ?? '未知'}　npm 最新：${official.latest ?? '获取失败'}` }),
          official.updateAvailable ? tag('有更新', 'dshdx-tag-err') : official.latest ? tag('已是最新', 'dshdx-tag-ok') : null,
        ),
        official.registry ? el('p', { class: 'dshdx-caption', text: `来源：${official.registry}` }) : null,
        official.error ? el('p', { class: 'dshdx-issue', text: official.error }) : null,
        mirrorDegraded && mirror?.error ? el('p', { class: 'dshdx-issue', text: `加速镜像异常：${mirror.error}` }) : null,
        mirrorDegraded && mirror?.activeUrl ? el('p', { class: 'dshdx-issue', text: `加速镜像主地址不可用，已自动切换备用地址：${mirror.activeUrl}${mirror.latest ? `（镜像版本 ${mirror.latest}）` : ''}` }) : null,
        official.sources.length > 0 ? el('p', { class: 'dshdx-caption', text: `可用来源：${official.sources.map((item) => `${item.label}${item.version ? `（${item.version}）` : ''}`).join('；')}` }) : null,
        el('p', { class: 'dshdx-caption', text: '一键更新优先从加速镜像下载预构建引擎包（无需走 npm 官方源），镜像不可用时自动回退到随包 npm 安装；更新版安装到用户目录并优先于内置版本运行。' }),
      )
      const desktop = result.desktop
      const downloadButton = btn('下载更新到本机', 'primary', async () => {
        downloadButton.disabled = true
        progress.classList.remove('dshdx-hidden')
        progress.textContent = ''
        try {
          const outcome = await call('updates:downloadDesktop')
          toast(`安装包已下载：${outcome.file}。已为你打开所在文件夹，双击即可安装。`)
        } catch (error) {
          toast(`下载失败：${error.message}`, true)
        } finally {
          downloadButton.disabled = false
        }
      }, true)
      const desktopDegraded = Boolean(desktop.error) || Boolean(desktop.source && !desktop.source.includes('199.7.140.33'))
      setChildren(desktopBody,
        el('div', { class: 'dshdx-rowline' },
          el('span', { text: `当前版本：${desktop.current}${desktop.latest ? `　最新版本：${desktop.latest}` : ''}` }),
          desktop.updateAvailable ? tag('有更新', 'dshdx-tag-err') : desktop.latest ? tag('已是最新', 'dshdx-tag-ok') : null,
        ),
        desktop.error ? el('p', { class: 'dshdx-issue', text: desktop.error }) : null,
        desktop.notes ? el('p', { class: 'dshdx-caption', text: desktop.notes }) : null,
        desktopDegraded && desktop.source ? el('p', { class: 'dshdx-issue', text: `默认更新源不可用，当前生效来源：${desktop.source}` }) : null,
        el('div', { class: 'dshdx-cardactions' },
          desktop.updateAvailable && desktop.url ? downloadButton : null,
          desktop.url ? btn('在浏览器中打开下载页', 'secondary', () => call('shell:openExternal', desktop.url), true) : null,
        ),
        el('p', { class: 'dshdx-caption', text: `上次检查：${new Date(result.checkedAt).toLocaleString()}` }),
      )
      // 仅在主地址不可用时才展示备用源切换区（需求：正常时不出现替换选项）。
      if (mirrorDegraded || desktopDegraded) {
        fallbackBox.classList.remove('dshdx-hidden')
        fallbackNotice.textContent = desktopDegraded && mirrorDegraded
          ? '默认更新源与加速镜像均不可用，可临时改用下方自定义地址。'
          : desktopDegraded
            ? '默认更新源（199.7.140.33:8010）暂时不可用，可临时改用自定义更新源。'
            : '加速镜像主地址暂时不可用，可临时改用自定义镜像地址。'
      } else {
        fallbackBox.classList.add('dshdx-hidden')
      }
    }

    const feedInput = input({ type: 'text', placeholder: '默认绑定官方镜像站 http://199.7.140.33:8010/feed.json' })
    const mirrorInput = input({ type: 'text', placeholder: '默认 http://199.7.140.33:8010，该地址不可用时自动启用备用地址' })
    const fallbackNotice = el('p', { class: 'dshdx-issue', text: '' })
    const fallbackBox = el('div', { class: 'dshdx-card dshdx-hidden' },
      el('span', { class: 'dshdx-cardtitle', text: '备用更新地址' }),
      fallbackNotice,
      field('自定义加速镜像地址', mirrorInput),
      field('自定义更新源地址（JSON：{ version, url, notes }）', feedInput),
      el('p', { class: 'dshdx-caption', text: '仅在默认地址（199.7.140.33:8010）无法访问时才需要修改；留空即恢复默认。默认地址恢复后可清空此处。' }),
    )
    call('app:info').then((info) => {
      root.replaceChildren(
        el('h3', { class: 'dshdx-title', text: '更新与关于' }),
        el('p', { class: 'dshdx-intro', text: '把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面。应用自动启动和管理本地 Harness 服务，集成系统托盘与桌面窗口，无需安装 Node.js 或执行命令。' }),
        el('div', { class: 'dshdx-card' },
          el('span', { class: 'dshdx-cardtitle', text: '官方引擎（@deepseek-ai/dsh）' }),
          officialBody, progress,
          el('div', { class: 'dshdx-cardactions' },
            btn('立即检查', 'secondary', async () => { toast('正在检查更新…'); renderUpdates(await safely('updates:check')) }),
            applyButton,
            btn('改用 npx 最新版重启', 'secondary', async () => {
              await safely('settings:set', { serviceMode: 'npx' })
              toast('已切换为 npx 最新版，正在重启服务…')
              await safely('service:restart').catch(() => {})
            }),
          ),
        ),
        el('div', { class: 'dshdx-card' },
          el('span', { class: 'dshdx-cardtitle', text: `桌面版 ${info.version}` }),
          desktopBody,
          el('p', { class: 'dshdx-caption', text: `DSH_HOME：${info.dshHome}` }),
          el('div', { class: 'dshdx-cardactions' },
            btn('GitHub 仓库', 'secondary', () => call('shell:openExternal', 'https://github.com/llh11/deepseek-harness-desktop'), true),
            btn('官方仓库', 'secondary', () => call('shell:openExternal', 'https://github.com/deepseek-ai/deepseek-harness'), true),
            btn('使用文档', 'secondary', () => call('shell:openExternal', 'https://github.com/deepseek-ai/deepseek-harness/blob/main/README.zh.md'), true),
          ),
        ),
        fallbackBox,
      )
      call('settings:get').then((settings) => {
        feedInput.value = settings.updateFeedUrl ?? ''
        mirrorInput.value = settings.engineMirrorUrl ?? ''
        feedInput.addEventListener('change', async () => {
          await safely('settings:set', { updateFeedUrl: feedInput.value.trim() })
          toast('更新源已保存')
        })
        mirrorInput.addEventListener('change', async () => {
          await safely('settings:set', { engineMirrorUrl: mirrorInput.value.trim() })
          toast('加速镜像地址已保存')
        })
      }).catch(() => {})
    }).catch(() => {})

    safely('updates:check').then(renderUpdates).catch(() => {})
    return root
  }

  const SECTION_BUILDERS = {
    'desktop-service': buildServiceSection,
    'desktop-usage': buildUsageSection,
    'desktop-skills': buildSkillsSection,
    'desktop-mcp': buildMcpSection,
    'desktop-update': buildUpdateSection,
  }

  // Warm the service-version caption once per page load.
  call('service:versions').then((versions) => {
    serviceVersionsText = versions.sources.map((item) => `${item.label}${item.version ? `（${item.version}）` : ''}`).join('　')
  }).catch(() => {})
}

module.exports = { init }
