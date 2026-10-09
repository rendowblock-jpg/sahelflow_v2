"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";

import {
  ALGERIA_CITIES,
  ALGERIA_LIVE_ROUTES,
  ALGERIA_MAP_HEIGHT,
  ALGERIA_MAP_WIDTH,
  algeriaArcPath,
  algeriaArcPoints,
  algeriaMapDots,
  algeriaOutlinePath,
  arcLength,
  pointOnArc,
  projectAlgeria,
  type AlgeriaCity,
  type AlgeriaPoint,
} from "@/lib/brand/algeria-map";
import { cn } from "@/lib/utils";

import styles from "./algeria-live-map.module.css";

const DOTS = algeriaMapDots(0.36);
const OUTLINE = algeriaOutlinePath();
const HUB: AlgeriaCity = "algiers";
const [HUB_X, HUB_Y] = projectAlgeria(ALGERIA_CITIES[HUB]);
const SVG_NS = "http://www.w3.org/2000/svg";

/** A handful of parcels at once reads as a live business, not as noise. */
const MAX_IN_FLIGHT = 5;
const DISPATCH_EVERY_MS: readonly [number, number] = [700, 1300];
const SPEED_PX_PER_MS = 0.32;
const MIN_FLIGHT_MS = 1_500;
const TRAIL = 0.16;
const ARRIVAL_HOLD_MS = 450;
const FADE_MS = 900;
const RING_MS = 1_300;
const BADGE_MS = 1_700;

interface Flight {
  id: number;
  city: AlgeriaCity;
  points: [AlgeriaPoint, AlgeriaPoint, AlgeriaPoint];
  start: number;
  duration: number;
  arrivedAt: number | null;
  nodes: {
    group: SVGGElement;
    arc: SVGPathElement;
    comet: SVGPathElement;
    halo: SVGCircleElement;
    parcel: SVGCircleElement;
  };
}

interface Effect {
  start: number;
  duration: number;
  node: SVGGElement;
  kind: "ring" | "badge";
}

const subscribeNever = () => () => {};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number | undefined>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) node.setAttribute(key, String(value));
  }
  parent?.appendChild(node);
  return node;
}

/**
 * The entry rail's live dispatch map: orders leave Algiers one after another,
 * each route draws itself ahead of a glowing parcel, and the wilaya lights up
 * and confirms delivery. Colours follow the app's light or dark theme.
 *
 * One requestAnimationFrame loop drives every moving part by writing SVG
 * attributes directly, so React never re-renders per frame. The loop idles
 * while the rail is hidden or the
 * tab is in the background, and freezes time across that gap so parcels never
 * jump. Under reduced motion the map is a still picture of the network.
 */
export function AlgeriaLiveMap({ className }: { className?: string }) {
  const reactId = useId().replace(/:/g, "");
  const glowId = `sf-dz-glow-${reactId}`;
  const clipId = `sf-dz-clip-${reactId}`;
  const blurId = `sf-dz-blur-${reactId}`;
  // The server cannot know the visitor's motion preference, so the still
  // variant applies only after hydration; both renders start identical.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = hydrated && prefersReducedMotion === true;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const liveRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const root = svgRef.current;
    const layer = liveRef.current;
    if (!root || !layer || reduceMotion) return;

    const flights: Flight[] = [];
    const effects: Effect[] = [];
    const recent: AlgeriaCity[] = [];
    let nextId = 1;
    let nextDispatch = performance.now() + 350;
    let last = performance.now();
    let frame = 0;

    const pickCity = (): AlgeriaCity => {
      const choices = ALGERIA_LIVE_ROUTES.filter(
        (city) => !recent.includes(city) && !flights.some((flight) => flight.city === city),
      );
      const pool = choices.length > 0 ? choices : ALGERIA_LIVE_ROUTES;
      const city = pool[Math.floor(Math.random() * pool.length)] ?? "oran";
      recent.push(city);
      if (recent.length > 5) recent.shift();
      return city;
    };

    const dispatch = (now: number) => {
      const city = pickCity();
      const points = algeriaArcPoints(HUB, city);
      const d = algeriaArcPath(HUB, city);
      const group = svg("g", { class: styles.flight }, layer);
      const arc = svg("path", { d, pathLength: 1, class: styles.arc }, group);
      const comet = svg("path", { d, pathLength: 1, class: styles.comet }, group);
      const halo = svg("circle", { r: 11, class: styles.halo, filter: `url(#${blurId})` }, group);
      const parcel = svg("circle", { r: 4.2, class: styles.parcel }, group);
      const [x, y] = points[0];
      for (const node of [halo, parcel]) {
        node.setAttribute("cx", String(x));
        node.setAttribute("cy", String(y));
      }
      arc.style.strokeDashoffset = "1";
      comet.style.strokeDasharray = `${TRAIL} 2`;
      comet.style.strokeDashoffset = String(TRAIL);
      flights.push({
        id: nextId++,
        city,
        points,
        start: now,
        duration: Math.max(MIN_FLIGHT_MS, arcLength(points) / SPEED_PX_PER_MS),
        arrivedAt: null,
        nodes: { group, arc, comet, halo, parcel },
      });
    };

    const arrive = (flight: Flight, now: number) => {
      flight.arrivedAt = now;
      const [x, y] = flight.points[2];
      const ring = svg("g", { class: styles.ringGroup }, layer);
      svg("circle", { cx: x, cy: y, r: 6, class: styles.ring }, ring);
      effects.push({ start: now, duration: RING_MS, node: ring, kind: "ring" });
      const badge = svg("g", { class: styles.badge }, layer);
      svg("circle", { cx: 0, cy: 0, r: 8.5, class: styles.badgeDisc }, badge);
      svg("path", { d: "M-3.6 0.2 L-1 2.8 L3.8 -2.4", class: styles.badgeTick }, badge);
      badge.dataset.x = String(x + 11);
      badge.dataset.y = String(y - 13);
      effects.push({ start: now, duration: BADGE_MS, node: badge, kind: "badge" });
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Freeze time while hidden so nothing teleports when the rail returns.
      const gap = now - last;
      last = now;
      if (gap > 250) {
        for (const flight of flights) {
          flight.start += gap;
          if (flight.arrivedAt !== null) flight.arrivedAt += gap;
        }
        for (const effect of effects) effect.start += gap;
        nextDispatch += gap;
      }
      if (root.clientWidth === 0) return;

      if (now >= nextDispatch && flights.filter((flight) => flight.arrivedAt === null).length < MAX_IN_FLIGHT) {
        dispatch(now);
        const [min, max] = DISPATCH_EVERY_MS;
        nextDispatch = now + min + Math.random() * (max - min);
      }

      for (let index = flights.length - 1; index >= 0; index -= 1) {
        const flight = flights[index];
        if (!flight) continue;
        const { arc, comet, halo, parcel, group } = flight.nodes;
        if (flight.arrivedAt === null) {
          const t = clamp01((now - flight.start) / flight.duration);
          const eased = easeInOut(t);
          const [x, y] = pointOnArc(flight.points, eased);
          arc.style.strokeDashoffset = String(1 - eased);
          comet.style.strokeDashoffset = String(TRAIL - eased);
          halo.setAttribute("cx", x.toFixed(1));
          halo.setAttribute("cy", y.toFixed(1));
          parcel.setAttribute("cx", x.toFixed(1));
          parcel.setAttribute("cy", y.toFixed(1));
          if (t >= 1) arrive(flight, now);
          continue;
        }
        const since = now - flight.arrivedAt;
        const settle = clamp01(since / 260);
        parcel.setAttribute("r", String(4.2 * (1 - settle)));
        halo.setAttribute("r", String(11 + 8 * settle));
        halo.style.opacity = String(1 - settle);
        comet.style.opacity = String(1 - settle);
        const fade = clamp01((since - ARRIVAL_HOLD_MS) / FADE_MS);
        group.style.opacity = String(1 - fade);
        if (fade >= 1) {
          group.remove();
          flights.splice(index, 1);
        }
      }

      for (let index = effects.length - 1; index >= 0; index -= 1) {
        const effect = effects[index];
        if (!effect) continue;
        const t = clamp01((now - effect.start) / effect.duration);
        if (effect.kind === "ring") {
          const circle = effect.node.firstElementChild as SVGCircleElement;
          circle.setAttribute("r", (6 + 22 * (1 - (1 - t) ** 3)).toFixed(1));
          effect.node.style.opacity = String(0.95 * (1 - t));
        } else {
          const pop = clamp01(t / 0.18);
          const out = clamp01((t - 0.72) / 0.28);
          const scale = (pop < 1 ? easeOutBack(pop) : 1) * (1 - 0.2 * out);
          const lift = 6 * out;
          effect.node.setAttribute(
            "transform",
            `translate(${effect.node.dataset.x} ${Number(effect.node.dataset.y) - lift}) scale(${scale.toFixed(3)})`,
          );
          effect.node.style.opacity = String(1 - out);
        }
        if (t >= 1) {
          effect.node.remove();
          effects.splice(index, 1);
        }
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      layer.replaceChildren();
    };
  }, [blurId, reduceMotion]);

  return (
    <div className={cn(styles.board, className)}>
      <svg
        ref={svgRef}
        className={styles.map}
        viewBox={`0 0 ${ALGERIA_MAP_WIDTH} ${ALGERIA_MAP_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient
            id={glowId}
            cx={(HUB_X / ALGERIA_MAP_WIDTH).toFixed(2)}
            cy={(HUB_Y / ALGERIA_MAP_HEIGHT).toFixed(2)}
            r="0.75"
          >
            <stop offset="0" className={styles.glowCore} />
            <stop offset="1" className={styles.glowEdge} />
          </radialGradient>
          <clipPath id={clipId}>
            <path d={OUTLINE} />
          </clipPath>
          <filter id={blurId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <path className={styles.shape} d={OUTLINE} pathLength={1} />
        <g className={styles.dots} clipPath={`url(#${clipId})`}>
          {DOTS.map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.6" />
          ))}
        </g>
        <rect
          className={styles.glow}
          width={ALGERIA_MAP_WIDTH}
          height={ALGERIA_MAP_HEIGHT}
          fill={`url(#${glowId})`}
          clipPath={`url(#${clipId})`}
        />
        {reduceMotion ? (
          <g>
            {ALGERIA_LIVE_ROUTES.slice(0, 8).map((city) => (
              <path key={city} className={styles.staticArc} d={algeriaArcPath(HUB, city)} />
            ))}
          </g>
        ) : null}
        <g>
          {ALGERIA_LIVE_ROUTES.map((city) => {
            const [x, y] = projectAlgeria(ALGERIA_CITIES[city]);
            return <circle key={city} className={styles.city} cx={x} cy={y} r="3.6" />;
          })}
        </g>
        <g ref={liveRef} />
        <circle className={styles.hubRing} cx={HUB_X} cy={HUB_Y} r="10" />
        <circle className={cn(styles.hubRing, styles.hubRingLate)} cx={HUB_X} cy={HUB_Y} r="10" />
        <circle className={styles.hubCore} cx={HUB_X} cy={HUB_Y} r="7" />
      </svg>
    </div>
  );
}
