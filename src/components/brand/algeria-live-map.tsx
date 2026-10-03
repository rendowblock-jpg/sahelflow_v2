"use client";

import { useId, useMemo } from "react";
import { useReducedMotion } from "framer-motion";

import {
  ALGERIA_CITIES,
  ALGERIA_LIVE_ROUTES,
  ALGERIA_MAP_HEIGHT,
  ALGERIA_MAP_WIDTH,
  algeriaArcPath,
  algeriaMapDots,
  algeriaOutlinePath,
  projectAlgeria,
} from "@/lib/brand/algeria-map";
import { cn } from "@/lib/utils";

import styles from "./algeria-live-map.module.css";

const DOTS = algeriaMapDots(0.36);
const OUTLINE = algeriaOutlinePath();
const [HUB_X, HUB_Y] = projectAlgeria(ALGERIA_CITIES.algiers);

export function AlgeriaLiveMap({ className }: { className?: string }) {
  const reactId = useId().replace(/:/g, "");
  const glowId = `sf-dz-glow-${reactId}`;
  const clipId = `sf-dz-clip-${reactId}`;
  const reduceMotion = useReducedMotion();
  const routes = useMemo(
    () =>
      ALGERIA_LIVE_ROUTES.map((city, index) => {
        const path = algeriaArcPath("algiers", city);
        const [x, y] = projectAlgeria(ALGERIA_CITIES[city]);
        return {
          city,
          path,
          x,
          y,
          dur: (3.2 + (index % 5) * 0.55).toFixed(2),
          begin: ((index * 0.37) % 3).toFixed(2),
        };
      }),
    [],
  );

  return (
    <svg
      className={cn(styles.map, className)}
      viewBox={`0 0 ${ALGERIA_MAP_WIDTH} ${ALGERIA_MAP_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient
          id={glowId}
          cx={(HUB_X / ALGERIA_MAP_WIDTH).toFixed(2)}
          cy={(HUB_Y / ALGERIA_MAP_HEIGHT).toFixed(2)}
          r="0.7"
        >
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.25" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      <path className={styles.shape} d={OUTLINE} />
      <g className={styles.dots} clipPath={`url(#${clipId})`}>
        {DOTS.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r="2.6" />
        ))}
      </g>
      <rect
        width={ALGERIA_MAP_WIDTH}
        height={ALGERIA_MAP_HEIGHT}
        fill={`url(#${glowId})`}
        clipPath={`url(#${clipId})`}
      />
      <g>
        {routes.map((route) => (
          <g key={route.city} style={{ ["--d" as string]: `${route.begin}s` }}>
            <path className={styles.arc} d={route.path} pathLength={1} />
            {reduceMotion ? null : (
              <circle className={styles.parcel} r="4">
                <animateMotion
                  dur={`${route.dur}s`}
                  begin={`${route.begin}s`}
                  repeatCount="indefinite"
                  path={route.path}
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines=".45 0 .25 1"
                />
              </circle>
            )}
            <circle className={styles.city} cx={route.x} cy={route.y} r="5" />
            <circle className={styles.cityRing} cx={route.x} cy={route.y} r="5" />
          </g>
        ))}
      </g>
      <circle className={styles.hubRing} cx={HUB_X} cy={HUB_Y} r="10" />
      <circle className={styles.hubCore} cx={HUB_X} cy={HUB_Y} r="7" />
    </svg>
  );
}
