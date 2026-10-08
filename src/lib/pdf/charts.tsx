// Lightweight, dependency-free chart primitives drawn with @react-pdf/renderer's
// SVG building blocks. Recharts (used by the live dashboard) renders to the DOM
// and cannot run inside the PDF renderer, so these mirror the same visual
// vocabulary (grid, axis, legend) using plain geometry instead.

import React from "react";
import { Svg, Rect, Line, Polyline, Circle, Path, Text as SvgText, View, Text } from "@react-pdf/renderer";
import { COLORS, formatAxisNumber } from "./theme";

const AXIS_COLOR = COLORS.borderStrong;
const GRID_COLOR = COLORS.border;
const LABEL_COLOR = COLORS.muted;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function gridLines(min: number, max: number, count = 4): number[] {
  const lines: number[] = [];
  for (let i = 0; i <= count; i++) lines.push(min + ((max - min) * i) / count);
  return lines;
}

// react-pdf's SVG Text typings omit `fontSize`, even though the renderer
// supports it via `style` — this wrapper keeps every axis label typed cleanly.
type AxisLabelStyle = { fontSize: number };

function AxisLabel({
  x,
  y,
  anchor = "start",
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  children: React.ReactNode;
}) {
  return (
    <SvgText x={x} y={y} textAnchor={anchor} fill={LABEL_COLOR} style={{ fontSize: 7.5 } as unknown as AxisLabelStyle}>
      {children}
    </SvgText>
  );
}

/* ---------------------------- Legend row ---------------------------- */

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6, gap: 14 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: it.color }} />
          <Text style={{ fontSize: 8.5, color: COLORS.body }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------- Grouped bar chart ------------------------- */

export function GroupedBarChart({
  width = 500,
  height = 190,
  categories,
  series,
  axisFormatter = formatAxisNumber,
}: {
  width?: number;
  height?: number;
  categories: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  axisFormatter?: (n: number) => string;
}) {
  const padLeft = 40;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...allValues, 1);
  const max = niceMax(rawMax * 1.1);
  const lines = gridLines(0, max);

  const slotW = plotW / Math.max(1, categories.length);
  const barGap = 3;
  const barW = Math.max(2, (slotW - barGap * (series.length + 1)) / series.length);

  const yFor = (v: number) => padTop + plotH - (Math.max(0, v) / max) * plotH;

  return (
    <Svg width={width} height={height}>
      {lines.map((v, i) => (
        <Line
          key={i}
          x1={padLeft}
          x2={width - padRight}
          y1={yFor(v)}
          y2={yFor(v)}
          stroke={i === 0 ? AXIS_COLOR : GRID_COLOR}
          strokeWidth={1}
        />
      ))}
      {lines.map((v, i) => (
        <AxisLabel key={`l-${i}`} x={padLeft - 6} y={yFor(v) + 3} anchor="end">
          {axisFormatter(v)}
        </AxisLabel>
      ))}

      {categories.map((cat, ci) => {
        const slotX = padLeft + ci * slotW;
        return (
          <React.Fragment key={cat + ci}>
            {series.map((s, si) => {
              const v = s.values[ci] ?? 0;
              const barX = slotX + barGap + si * (barW + barGap);
              const barY = yFor(v);
              const barH = Math.max(0, padTop + plotH - barY);
              return (
                <Rect
                  key={s.name}
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  fill={s.color}
                  rx={1.5}
                />
              );
            })}
            <AxisLabel x={slotX + slotW / 2} y={height - padBottom + 12} anchor="middle">
              {cat}
            </AxisLabel>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/* ------------------------------ Line chart ------------------------------ */

export function LineTrendChart({
  width = 500,
  height = 190,
  categories,
  series,
  axisFormatter = formatAxisNumber,
}: {
  width?: number;
  height?: number;
  categories: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  axisFormatter?: (n: number) => string;
}) {
  const padLeft = 42;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...allValues);
  const rawMin = Math.min(0, ...allValues);
  const max = niceMax(Math.max(rawMax * 1.15, 1));
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin) * 1.15) : 0;
  const lines = gridLines(min, max);

  const n = Math.max(1, categories.length - 1);
  const xFor = (i: number) => padLeft + (n === 0 ? plotW / 2 : (i / n) * plotW);
  const yFor = (v: number) => padTop + plotH - ((v - min) / (max - min)) * plotH;

  return (
    <Svg width={width} height={height}>
      {lines.map((v, i) => (
        <Line
          key={i}
          x1={padLeft}
          x2={width - padRight}
          y1={yFor(v)}
          y2={yFor(v)}
          stroke={Math.abs(v) < 1e-6 ? AXIS_COLOR : GRID_COLOR}
          strokeWidth={1}
        />
      ))}
      {lines.map((v, i) => (
        <AxisLabel key={`l-${i}`} x={padLeft - 6} y={yFor(v) + 3} anchor="end">
          {axisFormatter(v)}
        </AxisLabel>
      ))}

      {series.map((s) => (
        <Polyline
          key={s.name}
          points={s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={1.75}
        />
      ))}
      {series.map((s) =>
        s.values.map((v, i) => (
          <Circle key={`${s.name}-${i}`} cx={xFor(i)} cy={yFor(v)} r={1.8} fill={s.color} />
        ))
      )}

      {categories.map((cat, i) => {
        // Thin out labels when there are many months so they don't collide.
        const step = categories.length > 10 ? Math.ceil(categories.length / 8) : 1;
        if (i % step !== 0 && i !== categories.length - 1) return null;
        return (
          <AxisLabel key={cat + i} x={xFor(i)} y={height - padBottom + 12} anchor="middle">
            {cat}
          </AxisLabel>
        );
      })}
    </Svg>
  );
}

/* ------------------------------ Donut chart ------------------------------ */

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const startOuter = polarPoint(cx, cy, rOuter, startAngle);
  const endOuter = polarPoint(cx, cy, rOuter, endAngle);
  const startInner = polarPoint(cx, cy, rInner, endAngle);
  const endInner = polarPoint(cx, cy, rInner, startAngle);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  size = 150,
  data,
}: {
  size?: number;
  data: Array<{ name: string; value: number; color: string }>;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * 0.58;

  let cursor = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const frac = total > 0 ? d.value / total : 0;
      const start = cursor * 360;
      const end = (cursor + frac) * 360;
      cursor += frac;
      return { ...d, start, end, frac };
    });

  return (
    <Svg width={size} height={size}>
      {total <= 0 ? (
        <Circle cx={cx} cy={cy} r={rOuter} fill={COLORS.panelAlt} />
      ) : (
        slices.map((s, i) => (
          <Path key={i} d={donutSlicePath(cx, cy, rOuter, rInner, s.start, s.end)} fill={s.color} />
        ))
      )}
    </Svg>
  );
}

export function DonutLegend({
  data,
  formatValue,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  formatValue: (n: number) => string;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  return (
    <View style={{ flexGrow: 1 }}>
      {data.map((d) => {
        const pct = total > 0 ? (d.value / total) * 100 : 0;
        return (
          <View
            key={d.name}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 3,
              borderBottomWidth: 0.5,
              borderBottomColor: COLORS.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: d.color }} />
              <Text style={{ fontSize: 8.5, color: COLORS.body }}>{d.name}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontSize: 8.5, color: COLORS.muted, width: 32, textAlign: "right" }}>
                {pct.toFixed(1)}%
              </Text>
              <Text style={{ fontSize: 8.5, color: COLORS.ink, fontFamily: "Helvetica-Bold", width: 68, textAlign: "right" }}>
                {formatValue(d.value)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
