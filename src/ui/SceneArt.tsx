import type React from "react";
import "./sceneArt.css";

export type SceneKind = "night-bench" | "pitch-mood";

export interface SceneArtProps {
  readonly kind: SceneKind;
  /** 추가 클래스. 상위가 배치를 정한다. */
  readonly className?: string;
}

function NightBench(): React.JSX.Element {
  return (
    <svg className="sa-art sa-night-bench" viewBox="0 0 960 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sa-night-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101d22" />
          <stop offset="0.62" stopColor="#173c37" />
          <stop offset="1" stopColor="#274f45" />
        </linearGradient>
        <linearGradient id="sa-night-grass" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#396e5d" stopOpacity="0.7" />
          <stop offset="1" stopColor="#173c37" />
        </linearGradient>
        <radialGradient id="sa-night-glow">
          <stop stopColor="#d8f0a4" stopOpacity="0.36" />
          <stop offset="0.32" stopColor="#0d6261" stopOpacity="0.16" />
          <stop offset="1" stopColor="#0d6261" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className="sa-sky" width="960" height="430" fill="url(#sa-night-sky)" />
      <ellipse className="sa-light-glow sa-light-glow-left" cx="145" cy="108" rx="220" ry="170" fill="url(#sa-night-glow)" />
      <ellipse className="sa-light-glow sa-light-glow-right" cx="815" cy="108" rx="220" ry="170" fill="url(#sa-night-glow)" />
      <g className="sa-floodlights">
        <path d="M120 70v147m-30-147h60m-49 0v-24h38v24M840 70v147m-30-147h60m-49 0v-24h38v24" />
        <path d="M96 46h48M816 46h48" />
      </g>
      <path className="sa-horizon" d="M0 205C180 188 325 210 480 196s300-8 480 9v30H0z" />
      <path className="sa-pitch" d="M0 226h960v204H0z" fill="url(#sa-night-grass)" />
      <path className="sa-halfway" d="M0 286h960" />
      <g className="sa-bench">
        <path className="sa-bench-roof" d="M251 287h458l-27-43H278z" />
        <path className="sa-bench-seat" d="M281 329h398l-16-28H297z" />
        <path className="sa-bench-frame" d="M306 329v62m82-62v62m184-62v62m82-62v62M258 391h452" />
        <path className="sa-folded-shirt" d="M461 310l18-13h18l18 13-9 25h-36z" />
        <path className="sa-shirt-fold" d="M479 297l9 12 9-12m-18 13h18" />
      </g>
      <path className="sa-foreground" d="M0 389c184-20 320 29 493 8 168-20 294 10 467-8v41H0z" />
    </svg>
  );
}

function PitchMood(): React.JSX.Element {
  return (
    <svg className="sa-art sa-pitch-mood" viewBox="0 0 960 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sa-mood-sky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f4f5f2" />
          <stop offset="1" stopColor="#dfe8df" />
        </linearGradient>
        <linearGradient id="sa-mood-grass" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#769d8d" stopOpacity="0.24" />
          <stop offset="1" stopColor="#396e5d" stopOpacity="0.16" />
        </linearGradient>
        <radialGradient id="sa-mood-glow">
          <stop stopColor="#d8f0a4" stopOpacity="0.24" />
          <stop offset="1" stopColor="#0d6261" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className="sa-sky" width="960" height="360" fill="url(#sa-mood-sky)" />
      <ellipse className="sa-mood-light sa-mood-light-left" cx="190" cy="77" rx="240" ry="125" fill="url(#sa-mood-glow)" />
      <ellipse className="sa-mood-light sa-mood-light-right" cx="770" cy="77" rx="240" ry="125" fill="url(#sa-mood-glow)" />
      <path className="sa-mood-horizon" d="M0 160c173-12 323 11 486-3 161-14 284 10 474-4v32H0z" />
      <path className="sa-mood-field" d="M0 185h960v175H0z" fill="url(#sa-mood-grass)" />
      <path className="sa-mood-stripe" d="M0 206h960v28H0zm0 56h960v28H0zm0 56h960v28H0z" />
      <path className="sa-mood-line" d="M0 272h960" />
      <path className="sa-mood-vignette" d="M0 0h960v360H0z" />
    </svg>
  );
}

export function SceneArt({ kind, className }: SceneArtProps): React.JSX.Element {
  const sceneClassName = `sa-scene sa-scene-${kind}${className === undefined ? "" : ` ${className}`}`;

  return (
    <div className={sceneClassName}>
      {kind === "night-bench" ? <NightBench /> : <PitchMood />}
    </div>
  );
}
