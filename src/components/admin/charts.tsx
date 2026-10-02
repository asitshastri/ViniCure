"use client";

import { useId, useState } from "react";
import { Table as TableIcon, ChartLine } from "@phosphor-icons/react/ssr";
import { formatRupees } from "@/lib/format";

// Chart colours follow the dataviz method: fixed order, validated together (see the Progress log for F-18).
// Teal, amber and blue were checked with the validator for adjacent colour-blind separation and the lightness band.
// Amber is below 3:1 contrast on white, so every chart that uses it also has a legend, direct labels and a table view.
const STYLE = `
.viz-root{--surface:#fcfcfb;--ink:#12292b;--ink2:#4b6163;--grid:#e6eded;--s1:#0e9494;--s2:#d98a00;--s3:#3b5ba9}
`;

export type Series = { key: string; label: string; color: keyof typeof COLORS };
type ResolvedSeries = Omit<Series, "color"> & { color: string };
const COLORS = { teal: "var(--s1)", amber: "var(--s2)", blue: "var(--s3)" };

function Frame({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ResolvedSeries[];
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure
      className="viz-root border-line bg-surface shadow-card rounded-xl border p-5"
      style={{ background: "var(--surface)" }}
    >
      <style>{STYLE}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <p id={`${id}-t`} className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
            {title}
          </p>
          {subtitle ? (
            <p className="text-sm" style={{ color: "var(--ink2)" }}>
              {subtitle}
            </p>
          ) : null}
        </figcaption>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="border-line-strong hover:bg-primary-soft inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
        >
          {asTable ? (
            <ChartLine aria-hidden className="size-4" />
          ) : (
            <TableIcon aria-hidden className="size-4" />
          )}
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      {legend && legend.length > 1 ? (
        <ul
          className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm"
          aria-label="Legend"
          style={{ color: "var(--ink)" }}
        >
          {legend.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">{asTable ? table : children}</div>
    </figure>
  );
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

type Tip = {
  x: number;
  y: number;
  title: string;
  rows: Array<{ label: string; value: string; color?: string }>;
} | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max((tip.x / width) * 100, 12), 88);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-lg"
      style={{
        left: `${left}%`,
        top: Math.max(tip.y - 8, 0),
        transform: "translate(-50%, -100%)",
        color: "var(--ink)",
      }}
    >
      <p className="font-semibold">{tip.title}</p>
      {tip.rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 tabular-nums">
          {r.color ? (
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: r.color }}
            />
          ) : null}
          {r.label}: <span className="font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const W = 640;
const H = 240;
const M = { l: 58, r: 12, t: 12, b: 28 };

type LineProps = {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; value: number }>;
  unit: string;
  summary: string;
};

/** One series over time: a 2px line, a hover crosshair, and a table view. */
export function LineChart({ title, subtitle, data, unit, summary }: LineProps) {
  const [tip, setTip] = useState<Tip>(null);
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const x = (i: number) => M.l + (i * (W - M.l - M.r)) / (data.length - 1);
  const y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const ticks = [0, max / 2, max];
  const path = data
    .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const show = (i: number) => {
    setActive(i);
    const d = data[i]!;
    setTip({
      x: x(i),
      y: y(d.value),
      title: d.label,
      rows: [{ label: unit, value: String(d.value), color: "var(--s1)" }],
    });
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Day
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                {unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-line border-t">
                <th scope="row" className="py-2 font-normal">
                  {d.label}
                </th>
                <td className="py-2 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div
        role="region"
        tabIndex={0}
        aria-label={`${title} chart. Scrolls sideways on small screens.`}
        className="overflow-x-auto"
      >
        <div className="relative min-w-[34rem]" onMouseLeave={hide}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={M.l}
                  x2={W - M.r}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink2)">
                  {t}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              (data.length - 1 - i) % 4 === 0 ? (
                <text
                  key={d.label}
                  x={x(i)}
                  y={H - 8}
                  textAnchor={i === data.length - 1 ? "end" : "middle"}
                  fontSize={12}
                  fill="var(--ink2)"
                >
                  {d.label}
                </text>
              ) : null,
            )}
            <path
              d={path}
              fill="none"
              stroke="var(--s1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {active !== null ? (
              <g>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={M.t}
                  y2={H - M.b}
                  stroke="var(--ink2)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={x(active)}
                  cy={y(data[active]!.value)}
                  r={5}
                  fill="var(--s1)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </g>
            ) : null}
            {data.map((d, i) => (
              <rect
                key={d.label}
                x={x(i) - (W - M.l - M.r) / (data.length - 1) / 2}
                y={M.t}
                width={(W - M.l - M.r) / (data.length - 1)}
                height={H - M.t - M.b}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${d.value} ${unit}`}
                onMouseEnter={() => show(i)}
                onFocus={() => show(i)}
                onBlur={hide}
                className="outline-none focus-visible:stroke-[var(--ink)]"
                strokeWidth={2}
              />
            ))}
            <text
              x={x(data.length - 1) - 4}
              y={y(data.at(-1)!.value) - 10}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              fill="var(--ink)"
            >
              {data.at(-1)!.value}
            </text>
          </svg>
          <Tooltip tip={tip} width={W} />
        </div>
      </div>
    </Frame>
  );
}

type BarProps = {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; values: Record<string, number> }>;
  series: Series[];
  /** A name, not a function, because this component is rendered from a server page. */
  unit: "rupees" | "count";
  summary: string;
};

/** Stacked columns: 4px rounded top, a 2px gap between segments, hover tooltip, legend and a table view. */
export function StackedBars({ title, subtitle, data, series: named, unit, summary }: BarProps) {
  const series: ResolvedSeries[] = named.map((s) => ({ ...s, color: COLORS[s.color] }));
  const format = unit === "rupees" ? formatRupees : (n: number) => String(n);
  const [tip, setTip] = useState<Tip>(null);
  const [active, setActive] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((s, k) => s + (d.values[k.key] ?? 0), 0));
  const max = niceMax(Math.max(...totals));
  const band = (W - M.l - M.r) / data.length;
  const bw = Math.min(band * 0.6, 44);
  const y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const ticks = [0, max / 2, max];
  const show = (i: number) => {
    setActive(i);
    const d = data[i]!;
    setTip({
      x: M.l + band * i + band / 2,
      y: y(totals[i]!),
      title: `Week of ${d.label}`,
      rows: [
        ...series.map((s) => ({
          label: s.label,
          value: format(d.values[s.key] ?? 0),
          color: s.color,
        })),
        { label: "Total", value: format(totals[i]!) },
      ],
    });
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      legend={series}
      table={
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-2 font-semibold">
                  Week of
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-2 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
                <th scope="col" className="py-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.label} className="border-line border-t">
                  <th scope="row" className="py-2 font-normal">
                    {d.label}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="py-2 text-right tabular-nums">
                      {format(d.values[s.key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {format(totals[i]!)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <div
        role="region"
        tabIndex={0}
        aria-label={`${title} chart. Scrolls sideways on small screens.`}
        className="overflow-x-auto"
      >
        <div className="relative min-w-[34rem]" onMouseLeave={hide}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={M.l}
                  x2={W - M.r}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink2)">
                  {format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = M.l + band * i + band / 2;
              let acc = 0;
              return (
                <g key={d.label} opacity={active === null || active === i ? 1 : 0.55}>
                  {series.map((s, si) => {
                    const v = d.values[s.key] ?? 0;
                    const top = y(acc + v);
                    const h = y(acc) - top - 2;
                    acc += v;
                    const last = si === series.length - 1;
                    return h > 0 ? (
                      <path
                        key={s.key}
                        fill={s.color}
                        d={
                          last
                            ? `M${cx - bw / 2},${top + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${top + h} h${-bw} Z`
                            : `M${cx - bw / 2},${top} h${bw} v${h} h${-bw} Z`
                        }
                      />
                    ) : null;
                  })}
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--ink2)">
                    {d.label}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => (
              <rect
                key={`h-${d.label}`}
                x={M.l + band * i}
                y={M.t}
                width={band}
                height={H - M.t - M.b}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`Week of ${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(", ")}, total ${format(totals[i]!)}`}
                onMouseEnter={() => show(i)}
                onFocus={() => show(i)}
                onBlur={hide}
                className="outline-none focus-visible:stroke-[var(--ink)]"
                strokeWidth={2}
              />
            ))}
          </svg>
          <Tooltip tip={tip} width={W} />
        </div>
      </div>
    </Frame>
  );
}
