"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { OceanBottleSummary } from "@/app/actions/ocean";
import { translateRecipientRole, type LocaleDict } from "@/lib/i18n";

interface OceanCanvasProps {
  bottles: OceanBottleSummary[];
  viewedTodayIds: string[];
  litCandleIds: string[];
  ownBottleIds: string[];
  newlyCastBottleId?: string | null;
  t: LocaleDict;
  onSelectBottle: (bottle: OceanBottleSummary) => void;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  speed: number;
  phase: number;
}

interface Plankton {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  phase: number;
}

interface WaterRipple {
  worldX: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  lineWidth: number;
}

interface BottleWorldLayout {
  positions: Record<string, { worldX: number; worldY: number }>;
  minCameraX: number;
  maxCameraX: number;
}

const MIN_BOTTLE_DISTANCE_PX = 140; // Minimum guaranteed pixel spacing between bottles

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return { r: 79, g: 209, b: 197 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Computes well-spaced world coordinates (worldX, worldY) for all bottles.
 * Guarantees every bottle is at least MIN_BOTTLE_DISTANCE_PX apart.
 * When there are many bottles, they overflow horizontally beyond [0, width],
 * enabling smooth left/right edge-panning.
 */
function computeSpacedBottleLayout(
  bottles: OceanBottleSummary[],
  width: number,
  height: number
): BottleWorldLayout {
  if (bottles.length === 0 || width <= 0 || height <= 0) {
    return { positions: {}, minCameraX: 0, maxCameraX: 0 };
  }

  const minY = height * 0.27;
  const maxY = height * 0.81;

  // Expand initial horizontal world span when there are many bottles
  const comfortablePerScreen = Math.max(
    6,
    Math.floor((width * (maxY - minY)) / (MIN_BOTTLE_DISTANCE_PX * MIN_BOTTLE_DISTANCE_PX * 2.4))
  );
  const overflowRatio =
    bottles.length > comfortablePerScreen
      ? 1 + (bottles.length - comfortablePerScreen) * 0.13
      : 1;

  const spanWidth = width * overflowRatio;
  const startX = (width - spanWidth) / 2;

  const nodes = bottles.map((b, idx) => {
    const clampedPosX = Math.max(0.06, Math.min(0.94, b.posX));
    const clampedPosY = Math.max(0.27, Math.min(0.81, b.posY));
    return {
      id: b.id,
      x: startX + clampedPosX * spanWidth,
      y: clampedPosY * height,
      idx,
    };
  });

  // Deterministic Force-Directed Relaxation to guarantee minimum distance between bottles
  const iterations = 32;
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;

        // Weight vertical proximity slightly more so crowding pushes bottles horizontally
        const weightedDist = Math.hypot(dx, dy * 1.35);

        if (weightedDist < MIN_BOTTLE_DISTANCE_PX) {
          moved = true;
          if (weightedDist < 0.01) {
            dx = (i % 2 === 0 ? 1 : -1) * 4;
            dy = (j % 2 === 0 ? 1 : -1) * 2;
          }
          const overlap = (MIN_BOTTLE_DISTANCE_PX - weightedDist) * 0.52;
          const angle = Math.atan2(dy, dx);
          // Favor horizontal separation (1.25x) so overflow naturally goes left/right
          const pushX = Math.cos(angle) * overlap * 1.25;
          const pushY = Math.sin(angle) * overlap * 0.65;

          a.x -= pushX;
          b.x += pushX;
          a.y = Math.max(minY, Math.min(maxY, a.y - pushY));
          b.y = Math.max(minY, Math.min(maxY, b.y + pushY));
        }
      }
    }
    if (!moved) break;
  }

  let minWorldX = Infinity;
  let maxWorldX = -Infinity;
  const positions: Record<string, { worldX: number; worldY: number }> = {};

  for (const n of nodes) {
    positions[n.id] = { worldX: n.x, worldY: n.y };
    if (n.x < minWorldX) minWorldX = n.x;
    if (n.x > maxWorldX) maxWorldX = n.x;
  }

  const sidePadding = 95;
  const minCameraX = Math.min(0, minWorldX - sidePadding);
  const maxCameraX = Math.max(0, maxWorldX + sidePadding - width);

  return {
    positions,
    minCameraX,
    maxCameraX,
  };
}

export const OceanCanvas: React.FC<OceanCanvasProps> = ({
  bottles,
  viewedTodayIds,
  litCandleIds,
  ownBottleIds,
  newlyCastBottleId,
  t,
  onSelectBottle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bottlesRef = useRef<OceanBottleSummary[]>(bottles);
  const viewedIdsRef = useRef<Set<string>>(new Set(viewedTodayIds));
  const litIdsRef = useRef<Set<string>>(new Set(litCandleIds));
  const ownIdsRef = useRef<Set<string>>(new Set(ownBottleIds));
  const tRef = useRef<LocaleDict>(t);

  // Camera & World Layout refs for horizontal overflow & smooth edge panning
  const layoutRef = useRef<BottleWorldLayout>({
    positions: {},
    minCameraX: 0,
    maxCameraX: 0,
  });
  const cameraXRef = useRef<number>(0);
  const panVelocityXRef = useRef<number>(0);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });

  const [hoveredBottle, setHoveredBottle] = useState<{
    bottle: OceanBottleSummary;
    screenX: number;
    screenY: number;
  } | null>(null);

  const hoveredIdRef = useRef<string | null>(null);
  const hoverProgressRef = useRef<Record<string, number>>({});
  const ripplesRef = useRef<WaterRipple[]>([]);
  const lastMouseRippleTimeRef = useRef<number>(0);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    bottlesRef.current = bottles;
    if (typeof window !== "undefined") {
      const width = canvasRef.current?.clientWidth || window.innerWidth;
      const height = canvasRef.current?.clientHeight || window.innerHeight;
      layoutRef.current = computeSpacedBottleLayout(bottles, width, height);
      cameraXRef.current = Math.max(
        layoutRef.current.minCameraX,
        Math.min(layoutRef.current.maxCameraX, cameraXRef.current)
      );
    }
  }, [bottles]);

  useEffect(() => {
    viewedIdsRef.current = new Set(viewedTodayIds);
  }, [viewedTodayIds]);

  useEffect(() => {
    litIdsRef.current = new Set(litCandleIds);
  }, [litCandleIds]);

  useEffect(() => {
    ownIdsRef.current = new Set(ownBottleIds);
  }, [ownBottleIds]);

  // Spawn splash ripples and center camera when a new bottle is cast into the ocean
  useEffect(() => {
    if (!newlyCastBottleId || !canvasRef.current) return;
    const target = bottles.find((b) => b.id === newlyCastBottleId);
    if (!target) return;

    const width = canvasRef.current.clientWidth || window.innerWidth;
    const height = canvasRef.current.clientHeight || window.innerHeight;
    const layout = computeSpacedBottleLayout(bottles, width, height);
    layoutRef.current = layout;

    const pos = layout.positions[target.id] ?? {
      worldX: target.posX * width,
      worldY: target.posY * height,
    };

    // Smoothly bring the newly cast bottle into view if it's near the edge
    const desiredCamX = Math.max(
      layout.minCameraX,
      Math.min(layout.maxCameraX, pos.worldX - width * 0.5)
    );
    cameraXRef.current = desiredCamX;

    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        ripplesRef.current.push({
          worldX: pos.worldX,
          y: pos.worldY,
          radius: 6 + i * 8,
          maxRadius: 110 + i * 35,
          alpha: 0.85 - i * 0.15,
          color: target.tagColor,
          lineWidth: 2.2 - i * 0.3,
        });
      }, i * 160);
    }
  }, [newlyCastBottleId, bottles]);

  const computeWaveHeight = useCallback(
    (worldX: number, y: number, time: number): { dy: number; slope: number } => {
      const wave1 = Math.sin(worldX * 0.011 + time * 1.35 + y * 0.006) * 5.5;
      const wave2 = Math.cos(worldX * 0.021 - time * 0.95 + y * 0.012) * 3.2;
      const dy = wave1 + wave2;

      const dWave1 =
        Math.cos(worldX * 0.011 + time * 1.35 + y * 0.006) * 0.065;
      const dWave2 =
        -Math.sin(worldX * 0.021 - time * 0.95 + y * 0.012) * 0.05;
      const slope = dWave1 + dWave2;

      return { dy, slope };
    },
    []
  );

  const getBottleCoords = useCallback(
    (
      bottle: OceanBottleSummary,
      index: number,
      width: number,
      height: number,
      time: number,
      camX: number
    ) => {
      const layoutPos = layoutRef.current.positions[bottle.id];
      const baseWorldX = layoutPos
        ? layoutPos.worldX
        : Math.max(0.07, Math.min(0.93, bottle.posX)) * width;
      const baseWorldY = layoutPos
        ? layoutPos.worldY
        : Math.max(0.27, Math.min(0.81, bottle.posY)) * height;

      const driftX = Math.sin(time * 0.45 + index * 1.7) * 8;
      const driftY = Math.cos(time * 0.35 + index * 2.3) * 4;

      const worldX = baseWorldX + driftX;
      const baseY = baseWorldY + driftY;

      const { dy, slope } = computeWaveHeight(
        worldX,
        baseY,
        time + index * 0.4
      );
      const normY = baseWorldY / Math.max(1, height);
      const depthScale = 0.78 + ((normY - 0.23) / 0.65) * 0.48;

      return {
        worldX,
        x: worldX - camX,
        y: baseY + dy,
        slope,
        depthScale,
      };
    },
    [computeWaveHeight]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      layoutRef.current = computeSpacedBottleLayout(
        bottlesRef.current,
        width,
        height
      );
      cameraXRef.current = Math.max(
        layoutRef.current.minCameraX,
        Math.min(layoutRef.current.maxCameraX, cameraXRef.current)
      );
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const stars: Star[] = Array.from({ length: 95 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.23,
      radius: 0.5 + Math.random() * 1.35,
      baseAlpha: 0.25 + Math.random() * 0.65,
      speed: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
    }));

    const planktonColors = ["#4fd1c5", "#63b3ed", "#b794f4", "#f6ad55"];
    const planktons: Plankton[] = Array.from({ length: 55 }, () => ({
      x: Math.random(),
      y: 0.24 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00008,
      size: 0.9 + Math.random() * 2.1,
      color: planktonColors[Math.floor(Math.random() * planktonColors.length)],
      phase: Math.random() * Math.PI * 2,
    }));

    const startTime = performance.now();

    const render = (now: number) => {
      const time = (now - startTime) * 0.001;
      const horizonY = height * 0.23;

      // 0. Update Smooth Edge-Hover Camera Panning when bottles overflow horizontally
      const { minCameraX, maxCameraX } = layoutRef.current;
      const hasOverflow = maxCameraX - minCameraX > 4;
      const edgeZonePx = Math.min(130, width * 0.13);
      let targetVelX = 0;

      if (hasOverflow && pointerRef.current.active) {
        const mx = pointerRef.current.x;
        const my = pointerRef.current.y;
        // Only trigger edge panning when pointer is in the ocean middle vertical band
        // so interacting with header or bottom CTA buttons never causes unwanted panning
        if (my > height * 0.2 && my < height * 0.88) {
          if (mx < edgeZonePx && cameraXRef.current > minCameraX) {
            const strength = Math.pow(
              Math.max(0, 1 - mx / edgeZonePx),
              1.3
            );
            targetVelX = -strength * 6.5;
          } else if (
            mx > width - edgeZonePx &&
            cameraXRef.current < maxCameraX
          ) {
            const strength = Math.pow(
              Math.max(0, (mx - (width - edgeZonePx)) / edgeZonePx),
              1.3
            );
            targetVelX = strength * 6.5;
          }
        }
      }

      panVelocityXRef.current += (targetVelX - panVelocityXRef.current) * 0.1;
      if (Math.abs(panVelocityXRef.current) > 0.01) {
        cameraXRef.current = Math.max(
          minCameraX,
          Math.min(maxCameraX, cameraXRef.current + panVelocityXRef.current)
        );
      }
      const camX = cameraXRef.current;

      // 1. Night Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, "#020409");
      skyGrad.addColorStop(0.55, "#050811");
      skyGrad.addColorStop(1, "#0b1528");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY + 2);

      // 2. Twinkling Stars (subtle parallax with camX)
      for (const star of stars) {
        const twinkle =
          star.baseAlpha *
          (0.55 + 0.45 * Math.sin(time * star.speed + star.phase));
        const sx =
          (((star.x * width - camX * 0.12) % width) + width) % width;
        ctx.fillStyle = `rgba(226, 240, 255, ${twinkle.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, star.y * height, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Silver Moon & Halo
      const moonX = width * 0.5 - camX * 0.08;
      const moonY = height * 0.105;
      const moonHalo = ctx.createRadialGradient(
        moonX,
        moonY,
        4,
        moonX,
        moonY,
        Math.min(width, height) * 0.24
      );
      moonHalo.addColorStop(0, "rgba(235, 245, 255, 0.35)");
      moonHalo.addColorStop(0.2, "rgba(175, 215, 255, 0.12)");
      moonHalo.addColorStop(0.55, "rgba(79, 209, 197, 0.04)");
      moonHalo.addColorStop(1, "rgba(5, 8, 17, 0)");
      ctx.fillStyle = moonHalo;
      ctx.fillRect(0, 0, width, horizonY + 40);

      ctx.save();
      ctx.shadowColor = "rgba(220, 240, 255, 0.7)";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "rgba(240, 247, 255, 0.92)";
      ctx.beginPath();
      ctx.arc(moonX, moonY, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Deep Ocean Base Gradient
      const oceanGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      oceanGrad.addColorStop(0, "#0a1629");
      oceanGrad.addColorStop(0.28, "#071020");
      oceanGrad.addColorStop(0.65, "#050914");
      oceanGrad.addColorStop(1, "#03050b");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // 5. Moonlight Reflection Shimmer Column
      const shimmerBands = 28;
      for (let i = 0; i < shimmerBands; i++) {
        const frac = i / shimmerBands;
        const bandY =
          horizonY + 6 + Math.pow(frac, 1.35) * (height - horizonY - 20);
        const spread =
          (18 + frac * 190) * (0.85 + 0.15 * Math.sin(time * 1.3 + i));
        const offsetX = Math.sin(time * 1.6 + i * 0.7) * (4 + frac * 18);
        const alpha = (1 - frac * 0.75) * 0.14;

        ctx.fillStyle = `rgba(210, 235, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          moonX + offsetX,
          bandY,
          spread * 0.45,
          1.1 + frac * 1.8,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // 6. Undulating Night Wave Layers (shifted by camX for realistic world panning)
      const waveLayers = 7;
      for (let layer = 0; layer < waveLayers; layer++) {
        const progress = layer / (waveLayers - 1);
        const baseY =
          horizonY + 18 + Math.pow(progress, 1.25) * (height - horizonY - 30);
        const amp = 3.5 + progress * 9.5;
        const freq = 0.012 - progress * 0.005;
        const speed = (0.55 + progress * 0.65) * (layer % 2 === 0 ? 1 : -0.85);
        const layerParallaxX = camX * (0.35 + progress * 0.65);

        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, baseY);

        const step = 28;
        for (let x = 0; x <= width + step; x += step) {
          const wx = x + layerParallaxX;
          const y =
            baseY +
            Math.sin(wx * freq + time * speed + layer * 1.3) * amp +
            Math.cos(wx * freq * 1.8 - time * speed * 0.7 + layer) *
              (amp * 0.4);
          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        const waveFillAlpha = 0.18 + progress * 0.16;
        ctx.fillStyle = `rgba(5, 9, 20, ${waveFillAlpha.toFixed(3)})`;
        ctx.fill();

        ctx.strokeStyle =
          layer % 2 === 0
            ? `rgba(79, 209, 197, ${(0.05 + progress * 0.05).toFixed(3)})`
            : `rgba(180, 215, 255, ${(0.04 + progress * 0.04).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 7. Bioluminescent Plankton Specks
      for (const p of planktons) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0.25) p.y = 0.98;
        if (p.y > 0.99) p.y = 0.25;

        const pulse = 0.25 + 0.75 * Math.pow(Math.sin(time * 1.4 + p.phase), 2);
        const rgb = hexToRgb(p.color);
        const px =
          (((p.x * width - camX * 0.75) % width) + width) % width;
        const py = p.y * height;

        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(
          pulse * 0.5
        ).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 8. Interactive Water Ripples (in world space)
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += (r.maxRadius - r.radius) * 0.045 + 0.65;
        r.alpha *= 0.965;

        if (r.alpha <= 0.015 || r.radius >= r.maxRadius) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        const rgb = hexToRgb(r.color);
        ctx.save();
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${r.alpha.toFixed(
          3
        )})`;
        ctx.lineWidth = r.lineWidth;
        ctx.beginPath();
        ctx.ellipse(
          r.worldX - camX,
          r.y,
          r.radius,
          r.radius * 0.38,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }

      // 9. Floating Bioluminescent Glass Bottles
      const currentBottles = bottlesRef.current;
      let bottlesOffLeft = 0;
      let bottlesOffRight = 0;

      const indexedBottles = currentBottles
        .map((bottle, index) => {
          const coords = getBottleCoords(
            bottle,
            index,
            width,
            height,
            time,
            camX
          );
          if (coords.x < -25) bottlesOffLeft++;
          if (coords.x > width + 25) bottlesOffRight++;
          return { bottle, index, ...coords };
        })
        .sort((a, b) => a.y - b.y);

      for (const item of indexedBottles) {
        const { bottle, index, x, y, slope, depthScale } = item;
        // Skip rendering bottles far outside current viewport
        if (x < -90 || x > width + 90) continue;

        const isHovered = hoveredIdRef.current === bottle.id;
        const isViewed = viewedIdsRef.current.has(bottle.id);
        const isOwn = Boolean(bottle.isOwn) || ownIdsRef.current.has(bottle.id);

        const prevHover = hoverProgressRef.current[bottle.id] ?? 0;
        const targetHover = isHovered ? 1 : 0;
        const hoverVal = prevHover + (targetHover - prevHover) * 0.14;
        hoverProgressRef.current[bottle.id] = hoverVal;

        const rgb = hexToRgb(bottle.tagColor);
        const pulse =
          0.68 +
          0.32 * Math.sin(time * 2.3 + index * 1.9) +
          hoverVal * 0.45;

        const scale = depthScale * (1 + hoverVal * 0.24);

        ctx.save();
        ctx.translate(x, y);

        // 9a. Diffused Underwater Glow
        const glowRadius = (24 + hoverVal * 26) * scale;
        const glowGrad = ctx.createRadialGradient(
          0,
          2 * scale,
          2 * scale,
          0,
          2 * scale,
          glowRadius
        );
        const coreAlpha = Math.min(0.95, (0.4 + hoverVal * 0.48) * pulse);
        glowGrad.addColorStop(
          0,
          `rgba(255, 255, 255, ${(coreAlpha * (0.45 + hoverVal * 0.5)).toFixed(3)})`
        );
        glowGrad.addColorStop(
          0.32,
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${coreAlpha.toFixed(3)})`
        );
        glowGrad.addColorStop(
          0.7,
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(coreAlpha * 0.22).toFixed(3)})`
        );
        glowGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 2 * scale, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // 9b. Concentric Water Bobbing Rings & Dashed Marker Ring (drawn BEFORE the bottle so the bottle has higher z-index!)
        const ringRadius =
          (15 + hoverVal * 7 + 4 * Math.sin(time * 2.1 + index)) * scale;
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(
          0.32 +
          hoverVal * 0.4
        ).toFixed(3)})`;
        ctx.lineWidth = 1.2 + hoverVal * 0.8;
        ctx.beginPath();
        ctx.ellipse(
          0,
          (1 + hoverVal * 6) * scale,
          ringRadius,
          ringRadius * 0.35,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        if (isOwn) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          const markerRing = ringRadius * 1.38;
          ctx.strokeStyle = "rgba(52, 211, 153, 0.75)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(
            0,
            (1 + hoverVal * 6) * scale,
            markerRing,
            markerRing * 0.36,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }

        if (hoverVal > 0.05 || newlyCastBottleId === bottle.id) {
          const outerRing = ringRadius * (1.45 + hoverVal * 0.25);
          ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(
            0.32 * Math.max(hoverVal, 0.4)
          ).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(
            0,
            (1 + hoverVal * 6) * scale,
            outerRing,
            outerRing * 0.35,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }

        // 9c. Draw the Bottle ON TOP of the rings (Higher Z-Index) with Water-Line Submersion Clipping
        ctx.save();
        ctx.scale(scale, scale);

        const waterClipBottomY = 1.5 + hoverVal * 30;
        ctx.beginPath();
        ctx.rect(-40, -50, 80, 50 + waterClipBottomY);
        ctx.clip();

        const submergeY = (1 - hoverVal) * 5.0 - hoverVal * 4.5;
        const tiltAngle =
          -0.22 +
          hoverVal * -0.1 +
          slope * 1.6 +
          Math.sin(time * 1.5 + index) * 0.07;

        ctx.translate(0, submergeY);
        ctx.rotate(tiltAngle);

        // Glass bottle body (opaque dark ocean glass so rings behind it never show through)
        ctx.fillStyle = `rgba(12, 24, 44, ${(0.92 + hoverVal * 0.06).toFixed(2)})`;
        ctx.strokeStyle = `rgba(215, 245, 255, ${(
          0.65 +
          hoverVal * 0.32
        ).toFixed(3)})`;
        ctx.lineWidth = 1.35;

        ctx.beginPath();
        ctx.roundRect(-7.5, -8, 15, 21, 5.5);
        ctx.fill();
        ctx.stroke();

        // Bottle neck
        ctx.beginPath();
        ctx.roundRect(-3.6, -15.5, 7.2, 8.5, 2);
        ctx.fill();
        ctx.stroke();

        // Wooden Cork stopper (unopened bottles have cork; opened bottles are uncorked)
        if (!isViewed) {
          ctx.fillStyle = "#d4a36a";
          ctx.beginPath();
          ctx.roundRect(-2.9, -19.2, 5.8, 4.8, 1.3);
          ctx.fill();
        } else {
          const wispGrad = ctx.createLinearGradient(0, -15, 0, -28);
          wispGrad.addColorStop(
            0,
            `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`
          );
          wispGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
          ctx.fillStyle = wispGrad;
          ctx.beginPath();
          ctx.moveTo(-2.5, -15);
          ctx.lineTo(-5.5, -27);
          ctx.lineTo(5.5, -27);
          ctx.lineTo(2.5, -15);
          ctx.closePath();
          ctx.fill();
        }

        // Glowing rolled parchment letter inside the bottle
        ctx.save();
        ctx.shadowColor = bottle.tagColor;
        ctx.shadowBlur = 10 + hoverVal * 12;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(
          0.78 +
          hoverVal * 0.22
        ).toFixed(3)})`;
        ctx.beginPath();
        ctx.roundRect(-4, -5.5, 8, 13.5, 2.5);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.65 + hoverVal * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(-1.7, -3.5, 3.4, 9.5, 1.5);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.35 + hoverVal * 0.3).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4.5, -5);
        ctx.lineTo(-4.5, 9);
        ctx.stroke();

        ctx.restore(); // End clipped bottle group

        // Subtle water surface meniscus line only when bottle is submerged (fades out when hovered)
        if (hoverVal < 0.85) {
          const meniscusWidth = 12.5 * scale;
          const meniscusAlpha = (1 - hoverVal) * 0.5;
          ctx.strokeStyle = `rgba(210, 245, 255, ${meniscusAlpha.toFixed(2)})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(-meniscusWidth, 1.5 * scale);
          ctx.quadraticCurveTo(0, 3.5 * scale, meniscusWidth, 1.5 * scale);
          ctx.stroke();
        }

        // 9d. Persistent Floating Visual Marker Badge above Own Bottles (opened bottles are already indicated by the uncorked light beam)
        if (isOwn && hoverVal < 0.75) {
          const badgeAlpha = Math.max(0, 1 - hoverVal * 1.3);
          const floatOffset = Math.sin(time * 2.6 + index) * 2.5;
          const badgeY = (-29 - hoverVal * 7) * scale + floatOffset;
          const labelText = `★ ${tRef.current.canvas_mine_tag}`;

          ctx.save();
          ctx.globalAlpha = badgeAlpha;
          ctx.font = `600 ${Math.round(9.5 * Math.max(0.85, scale))}px sans-serif`;
          const textWidth = ctx.measureText(labelText).width;
          const padX = 6 * scale;
          const boxW = textWidth + padX * 2;
          const boxH = 15 * scale;

          ctx.strokeStyle = "rgba(52, 211, 153, 0.45)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, badgeY + boxH / 2);
          ctx.lineTo(0, (-15 - hoverVal * 5) * scale);
          ctx.stroke();

          ctx.fillStyle = "rgba(5, 8, 17, 0.88)";
          ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(-boxW / 2, badgeY - boxH / 2, boxW, boxH, 999);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#6ee7b7";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, 0, badgeY + 0.5);
          ctx.restore();
        }

        ctx.restore();
      }

      // 10. Subtle Edge-Panning Indicators when more bottles exist off-screen to the left or right
      if (hasOverflow) {
        const midY = height * 0.54;

        if (camX > minCameraX + 6) {
          const isLeftHover =
            pointerRef.current.active && pointerRef.current.x < edgeZonePx;
          const alpha = isLeftHover ? 0.85 : 0.45;
          ctx.save();
          ctx.fillStyle = `rgba(5, 8, 17, ${(alpha * 0.85).toFixed(2)})`;
          ctx.strokeStyle = `rgba(79, 209, 197, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(14, midY - 22, 34, 44, 17);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = `rgba(79, 209, 197, ${(alpha + 0.1).toFixed(2)})`;
          ctx.font = "600 16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("‹", 31, midY - 4);
          if (bottlesOffLeft > 0) {
            ctx.font = "500 10px sans-serif";
            ctx.fillText(`${bottlesOffLeft}`, 31, midY + 10);
          }
          ctx.restore();
        }

        if (camX < maxCameraX - 6) {
          const isRightHover =
            pointerRef.current.active &&
            pointerRef.current.x > width - edgeZonePx;
          const alpha = isRightHover ? 0.85 : 0.45;
          ctx.save();
          ctx.fillStyle = `rgba(5, 8, 17, ${(alpha * 0.85).toFixed(2)})`;
          ctx.strokeStyle = `rgba(79, 209, 197, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(width - 48, midY - 22, 34, 44, 17);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = `rgba(79, 209, 197, ${(alpha + 0.1).toFixed(2)})`;
          ctx.font = "600 16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("›", width - 31, midY - 4);
          if (bottlesOffRight > 0) {
            ctx.font = "500 10px sans-serif";
            ctx.fillText(`${bottlesOffRight}`, width - 31, midY + 10);
          }
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [getBottleCoords, newlyCastBottleId]);

  const findBottleAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      const time = performance.now() * 0.001;
      const camX = cameraXRef.current;

      let closest: {
        bottle: OceanBottleSummary;
        screenX: number;
        screenY: number;
        worldX: number;
        dist: number;
      } | null = null;

      bottlesRef.current.forEach((bottle, index) => {
        const coords = getBottleCoords(
          bottle,
          index,
          width,
          height,
          time,
          camX
        );
        const dx = x - coords.x;
        const dy = y - coords.y;
        const dist = Math.hypot(dx, dy);
        const hitRadius = 30 * coords.depthScale;

        if (dist <= hitRadius && (!closest || dist < closest.dist)) {
          closest = {
            bottle,
            screenX: coords.x,
            screenY: coords.y,
            worldX: coords.worldX,
            dist,
          };
        }
      });

      return closest as {
        bottle: OceanBottleSummary;
        screenX: number;
        screenY: number;
        worldX: number;
        dist: number;
      } | null;
    },
    [getBottleCoords]
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const prev = pointerRef.current;
    const moveDist = Math.hypot(x - prev.x, y - prev.y);
    pointerRef.current = { x, y, active: true };

    const now = performance.now();
    if (
      y > rect.height * 0.23 &&
      moveDist > 12 &&
      now - lastMouseRippleTimeRef.current > 65
    ) {
      lastMouseRippleTimeRef.current = now;
      ripplesRef.current.push({
        worldX: x + cameraXRef.current,
        y,
        radius: 3,
        maxRadius: 34 + Math.min(moveDist * 0.5, 28),
        alpha: 0.34,
        color: "#4fd1c5",
        lineWidth: 1.1,
      });
    }

    const hit = findBottleAtPoint(e.clientX, e.clientY);
    if (hit) {
      hoveredIdRef.current = hit.bottle.id;
      setHoveredBottle({
        bottle: hit.bottle,
        screenX: hit.screenX,
        screenY: hit.screenY,
      });
    } else {
      hoveredIdRef.current = null;
      if (hoveredBottle) setHoveredBottle(null);
    }
  };

  const handlePointerLeave = () => {
    pointerRef.current.active = false;
    hoveredIdRef.current = null;
    if (hoveredBottle) setHoveredBottle(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = findBottleAtPoint(e.clientX, e.clientY);

    if (hit) {
      for (let i = 0; i < 2; i++) {
        ripplesRef.current.push({
          worldX: hit.worldX,
          y: hit.screenY,
          radius: 6 + i * 6,
          maxRadius: 72 + i * 25,
          alpha: 0.7 - i * 0.2,
          color: hit.bottle.tagColor,
          lineWidth: 1.8 - i * 0.4,
        });
      }
      onSelectBottle(hit.bottle);
    } else if (y > rect.height * 0.23) {
      ripplesRef.current.push({
        worldX: x + cameraXRef.current,
        y,
        radius: 4,
        maxRadius: 64,
        alpha: 0.45,
        color: "#4fd1c5",
        lineWidth: 1.4,
      });
    }
  };

  const isHoveredOwn =
    hoveredBottle &&
    (Boolean(hoveredBottle.bottle.isOwn) ||
      ownBottleIds.includes(hoveredBottle.bottle.id));

  return (
    <div className="relative inset-0 w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleCanvasClick}
        className={`block w-full h-full ${
          hoveredBottle ? "cursor-pointer" : "cursor-default"
        }`}
      />

      {/* Floating Tooltip when hovering over a bottle on the ocean */}
      {hoveredBottle && (
        <div
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full transition-transform duration-150"
          style={{
            left: `${Math.max(
              140,
              Math.min(
                (typeof window !== "undefined" ? window.innerWidth : 1000) -
                  140,
                hoveredBottle.screenX
              )
            )}px`,
            top: `${Math.max(85, hoveredBottle.screenY - 32)}px`,
          }}
        >
          <div className="rounded-xl border border-white/15 bg-midnight/90 px-3.5 py-2 text-xs text-slate-100 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 font-medium">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: hoveredBottle.bottle.tagColor,
                  boxShadow: `0 0 10px ${hoveredBottle.bottle.tagColor}`,
                }}
              />
              <span>
                {t.tooltip_to}{" "}
                {translateRecipientRole(hoveredBottle.bottle.recipientRole, t)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
              <span>
                🕯️ {hoveredBottle.bottle.candleCount} {t.tooltip_candles}
              </span>
              <span
                className={
                  isHoveredOwn ? "text-emerald-300 font-medium" : "text-biocyan"
                }
              >
                {isHoveredOwn
                  ? t.tooltip_own_bottle
                  : viewedTodayIds.includes(hoveredBottle.bottle.id)
                  ? t.tooltip_viewed_today
                  : t.tooltip_click_to_open}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OceanCanvas;
