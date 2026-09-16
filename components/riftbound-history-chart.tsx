'use client';

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type RiftboundPriceHistoryEntry = {
  date: string;
  finish: 'normal' | 'foil';
  price: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  granularity?: 'month';
};

export type RiftboundCollectionValueHistoryEntry = {
  date: string;
  value: number;
  pricedCopies: number;
  totalCopies: number;
  granularity?: 'month';
};

export type RiftboundHistoryRangeKey = '30d' | '3mo' | '1y' | 'all';

export const RIFTBOUND_HISTORY_RANGE_OPTIONS: Array<{
  value: RiftboundHistoryRangeKey;
  label: string;
  days: number;
}> = [
  { value: '30d', label: '30 D', days: 30 },
  { value: '3mo', label: '3 MO', days: 90 },
  { value: '1y', label: '1 Y', days: 365 },
  { value: 'all', label: 'All', days: 365 },
];

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const HISTORY_CHART_WIDTH = 720;
const HISTORY_CHART_HEIGHT = 250;
const COLLECTION_HISTORY_CHART_WIDTH = 760;
const COLLECTION_HISTORY_CHART_HEIGHT = 270;
const HISTORY_CARD_LOADING_HEIGHT_CLASS = 'h-[18.125rem] sm:h-[18.625rem]';
const HISTORY_COLLECTION_LOADING_HEIGHT_CLASS = 'h-[19.3125rem] sm:h-[19.8125rem]';

export function getRiftboundHistoryRangeDays(range: RiftboundHistoryRangeKey) {
  return RIFTBOUND_HISTORY_RANGE_OPTIONS.find((option) => option.value === range)?.days ?? 30;
}

function formatMarketPrice(value: number) {
  return currencyFormatter.format(value);
}

function formatMarketPriceOrUnavailable(value: number | null) {
  return value === null ? 'N/A' : formatMarketPrice(value);
}

function formatHistoryDate(value: string, granularity: 'day' | 'month' = 'day') {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: granularity === 'month' ? 'numeric' : undefined,
    day: granularity === 'day' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).formatToParts(new Date(`${value}T00:00:00Z`)).filter((part) => granularity === 'month' || part.type !== 'year').map((part) => part.value).join('');
}

function formatHistoryTooltipDate(value: string, granularity: 'day' | 'month' = 'day') {
  const date = new Date(`${value}T00:00:00Z`);
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
  const day = date.getUTCDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date)} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

function getHistoryDateDomain(values: string[], granularity: 'day' | 'month' = 'day') {
  const sortedValues = Array.from(new Set(values)).sort();
  if (sortedValues.length < 2) return sortedValues;

  const start = new Date(`${sortedValues[0]}T00:00:00Z`);
  const end = new Date(`${sortedValues[sortedValues.length - 1]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sortedValues;

  const dates: string[] = [];
  if (granularity === 'month') {
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();
    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth();
    while (year < endYear || (year === endYear && month <= endMonth)) {
      dates.push(`${year}-${String(month + 1).padStart(2, '0')}-01`);
      month += 1;
      if (month === 12) {
        month = 0;
        year += 1;
      }
    }
    return dates;
  }

  for (let timestamp = start.getTime(); timestamp <= end.getTime(); timestamp += 24 * 60 * 60 * 1000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
}

function getHistoryLabelIndexes(length: number, maximum = 8) {
  if (length <= maximum) return Array.from({ length }, (_, index) => index);

  return Array.from({ length: maximum }, (_, index) => Math.round((index / (maximum - 1)) * (length - 1)));
}

function buildHistoryLineSegments(
  values: Array<number | null>,
  getX: (index: number) => number,
  getY: (value: number) => number,
) {
  const segments: string[] = [];
  let points: string[] = [];

  values.forEach((value, index) => {
    if (value === null) return;

    points.push(`${getX(index)},${getY(value)}`);
  });

  if (points.length > 0) segments.push(points.join(' '));
  return segments;
}

function getChartPointerPosition(
  event: ReactPointerEvent<SVGSVGElement>,
  width: number,
  height: number,
  plotLeft: number,
  plotTop: number,
  plotRight: number,
  plotBottom: number,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const x = ((event.clientX - bounds.left) / bounds.width) * width;
  const y = ((event.clientY - bounds.top) / bounds.height) * height;
  return {
    x: Math.max(plotLeft, Math.min(plotRight, x)),
    y: Math.max(plotTop, Math.min(plotBottom, y)),
  };
}

function getNearestHistoryIndex(x: number, length: number, getX: (index: number) => number) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < length; index += 1) {
    const distance = Math.abs(getX(index) - x);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }

  return nearestIndex;
}

type HistoryTooltipLine = {
  label: string;
  value: string;
  color?: string;
};

type HistoryPointTooltip = {
  chartWidth: number;
  chartHeight: number;
  x: number;
  y: number;
  date: string;
  lines: HistoryTooltipLine[];
  detail?: string;
};

function HistoryChartTooltip({ point }: { point: HistoryPointTooltip }) {
  const placeBelow = point.y < 76;
  const horizontalAlignment = point.x / point.chartWidth <= 0.18
    ? 'start'
    : point.x / point.chartWidth >= 0.82
      ? 'end'
      : 'center';
  const horizontalClassName = horizontalAlignment === 'start'
    ? 'translate-x-0'
    : horizontalAlignment === 'end'
      ? '-translate-x-full'
      : '-translate-x-1/2';

  return (
    <div
      className={`pointer-events-none absolute z-10 w-max max-w-[14rem] rounded-xl border border-amber-200/40 bg-slate-950 px-3 py-2 text-left text-xs text-slate-100 ${horizontalClassName} ${placeBelow ? '' : '-translate-y-full'}`}
      style={{ left: `${(point.x / point.chartWidth) * 100}%`, top: `${(point.y / point.chartHeight) * 100}%`, marginTop: placeBelow ? '0.5rem' : '-0.5rem' }}
      role="status"
    >
      <p className="whitespace-nowrap font-black text-amber-200">{point.date}</p>
      <div className="mt-1 grid gap-1">
        {point.lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-4 text-[0.65rem] font-bold uppercase tracking-[0.1em]">
            <span className="text-slate-500">{line.label}</span>
            <span className="text-right" style={line.color ? { color: line.color } : undefined}>{line.value}</span>
          </div>
        ))}
      </div>
      {point.detail ? <p className="mt-1 text-[0.65rem] text-slate-400">{point.detail}</p> : null}
    </div>
  );
}

function HistoryCrosshair({
  point,
  plotLeft,
  plotTop,
  plotRight,
  plotBottom,
  yValue,
}: {
  point: HistoryPointTooltip;
  plotLeft: number;
  plotTop: number;
  plotRight: number;
  plotBottom: number;
  yValue: number;
}) {
  return (
    <g pointerEvents="none">
      <line x1={point.x} x2={point.x} y1={plotTop} y2={plotBottom} stroke="#fcd34d" strokeOpacity="0.5" strokeDasharray="3 4" />
      <line x1={plotLeft} x2={plotRight} y1={point.y} y2={point.y} stroke="#fcd34d" strokeOpacity="0.5" strokeDasharray="3 4" />
      <text x={plotLeft - 10} y={point.y + 4} textAnchor="end" fill="#fcd34d" fontSize="10">{formatMarketPrice(yValue)}</text>
    </g>
  );
}

export function RiftboundHistoryRangeSelector({
  value,
  onChange,
}: {
  value: RiftboundHistoryRangeKey;
  onChange: (value: RiftboundHistoryRangeKey) => void;
}) {
  return (
    <div role="group" aria-label="History time range" className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 p-1">
      {RIFTBOUND_HISTORY_RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-2 py-1.5 text-[0.6rem] font-black uppercase tracking-[0.1em] transition ${value === option.value ? 'bg-amber-300 text-slate-950' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RiftboundHistoryChartLoading({ kind, message }: { kind: 'card' | 'collection'; message: string }) {
  const heightClassName = kind === 'card' ? HISTORY_CARD_LOADING_HEIGHT_CLASS : HISTORY_COLLECTION_LOADING_HEIGHT_CLASS;
  return <div className={`flex ${heightClassName} items-center justify-center rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500`} aria-live="polite">{message}</div>;
}

export function RiftboundPriceHistoryChart({ history }: { history: RiftboundPriceHistoryEntry[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<HistoryPointTooltip | null>(null);
  const granularity = history.some((entry) => entry.granularity === 'month') ? 'month' : 'day';
  const dates = useMemo(() => getHistoryDateDomain(history.map((entry) => entry.date), granularity), [granularity, history]);
  const valuesByKey = useMemo(
    () => new Map(history.map((entry) => [`${entry.date}:${entry.finish}`, entry.price])),
    [history],
  );
  const entriesByKey = useMemo(
    () => new Map(history.map((entry) => [`${entry.date}:${entry.finish}`, entry])),
    [history],
  );
  const series = [
    { finish: 'normal' as const, label: 'Normal', color: '#7dd3fc' },
    { finish: 'foil' as const, label: 'Foil', color: '#fcd34d' },
  ].map((entry) => ({
    ...entry,
    values: dates.map((date) => valuesByKey.get(`${date}:${entry.finish}`) ?? null),
  })).filter((entry) => entry.values.some((value) => value !== null));
  const prices = history.flatMap((entry) => entry.price === null ? [] : [entry.price]);

  useEffect(() => {
    setHoveredPoint(null);
  }, [history]);

  if (dates.length === 0 || prices.length === 0 || series.length === 0) {
    return <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">No captured market values yet.</p>;
  }

  const width = HISTORY_CHART_WIDTH;
  const height = HISTORY_CHART_HEIGHT;
  const plotLeft = 52;
  const plotRight = 704;
  const plotTop = 20;
  const plotBottom = 188;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const maxPrice = Math.max(...prices, 0.01);
  const getX = (index: number) => dates.length === 1
    ? plotLeft + (plotWidth / 2)
    : plotLeft + ((index / (dates.length - 1)) * plotWidth);
  const getY = (value: number) => plotBottom - ((value / maxPrice) * plotHeight);
  const labelIndexes = getHistoryLabelIndexes(dates.length);
  const yValues = [maxPrice, maxPrice / 2, 0];
  const buildPoint = (dateIndex: number, y: number, cursorX = getX(dateIndex)): HistoryPointTooltip => ({
    chartWidth: width,
    chartHeight: height,
    x: cursorX,
    y,
    date: formatHistoryTooltipDate(dates[dateIndex], granularity),
    lines: series.flatMap((entry) => {
      const historyEntry = entriesByKey.get(`${dates[dateIndex]}:${entry.finish}`);
      return [
        {
          label: `${entry.label} Market`,
          value: formatMarketPriceOrUnavailable(entry.values[dateIndex]),
          color: entry.color,
        },
        {
          label: `${entry.label} Low`,
          value: formatMarketPriceOrUnavailable(historyEntry?.lowPrice ?? null),
          color: '#94a3b8',
        },
        {
          label: `${entry.label} High`,
          value: formatMarketPriceOrUnavailable(historyEntry?.highPrice ?? null),
          color: '#cbd5e1',
        },
      ];
    }),
  });

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pointer = getChartPointerPosition(event, width, height, plotLeft, plotTop, plotRight, plotBottom);
    if (!pointer) return;
    const dateIndex = getNearestHistoryIndex(pointer.x, dates.length, getX);
    setHoveredPoint(buildPoint(dateIndex, pointer.y, pointer.x));
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/50 p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((entry) => (
            <span key={entry.finish} className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
        <span className="text-[0.65rem] font-semibold text-slate-500">USD per card</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Riftbound card market value history line graph"
          className="h-[250px] min-w-[36rem] w-full"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredPoint(null)}
        >
          {yValues.map((value) => {
            const y = getY(value);
            return (
              <g key={value}>
                <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
                <text x={plotLeft - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatMarketPrice(value)}</text>
              </g>
            );
          })}
          <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="rgba(148,163,184,0.3)" />
          {series.map((entry) => buildHistoryLineSegments(entry.values, getX, getY).map((points, index) => (
            <polyline key={`${entry.finish}-${index}`} points={points} fill="none" stroke={entry.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )))}
          {series.flatMap((entry) => entry.values.map((value, index) => value === null ? null : (() => {
            const point = buildPoint(index, getY(value));
            return <circle
              key={`${entry.finish}-${dates[index]}`}
              cx={point.x}
              cy={getY(value)}
              r="6"
              fill="#030712"
              stroke={entry.color}
              strokeWidth="2"
              tabIndex={0}
              role="img"
              aria-label={`${entry.label} market: ${formatMarketPriceOrUnavailable(value)}, low: ${formatMarketPriceOrUnavailable(entriesByKey.get(`${dates[index]}:${entry.finish}`)?.lowPrice ?? null)}, high: ${formatMarketPriceOrUnavailable(entriesByKey.get(`${dates[index]}:${entry.finish}`)?.highPrice ?? null)} - ${point.date}`}
              onFocus={() => setHoveredPoint(point)}
              onBlur={() => setHoveredPoint(null)}
            />;
          })()))}
          {hoveredPoint ? (
            <HistoryCrosshair
              point={hoveredPoint}
              plotLeft={plotLeft}
              plotTop={plotTop}
              plotRight={plotRight}
              plotBottom={plotBottom}
              yValue={Math.max(0, Math.min(maxPrice, maxPrice * ((plotBottom - hoveredPoint.y) / plotHeight)))}
            />
          ) : null}
          {labelIndexes.map((index) => (
            <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill={hoveredPoint?.date === formatHistoryTooltipDate(dates[index], granularity) ? '#fcd34d' : '#64748b'} fontSize="11">{formatHistoryDate(dates[index], granularity)}</text>
          ))}
        </svg>
        {hoveredPoint ? <HistoryChartTooltip point={hoveredPoint} /> : null}
      </div>
    </div>
  );
}

export function RiftboundCollectionValueHistoryChart({ history }: { history: RiftboundCollectionValueHistoryEntry[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<HistoryPointTooltip | null>(null);
  const granularity = history.some((entry) => entry.granularity === 'month') ? 'month' : 'day';
  const dates = useMemo(() => getHistoryDateDomain(history.map((entry) => entry.date), granularity), [granularity, history]);
  const valuesByDate = useMemo(() => new Map(history.map((entry) => [entry.date, entry])), [history]);

  useEffect(() => {
    setHoveredPoint(null);
  }, [history]);

  if (history.length === 0) {
    return <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">No collection value snapshots are available yet.</p>;
  }

  const width = COLLECTION_HISTORY_CHART_WIDTH;
  const height = COLLECTION_HISTORY_CHART_HEIGHT;
  const plotLeft = 58;
  const plotRight = 728;
  const plotTop = 22;
  const plotBottom = 198;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const values = dates.map((date) => valuesByDate.get(date)?.value ?? null);
  const maxValue = Math.max(...history.map((entry) => entry.value), 0.01);
  const getX = (index: number) => dates.length === 1
    ? plotLeft + (plotWidth / 2)
    : plotLeft + ((index / (dates.length - 1)) * plotWidth);
  const getY = (value: number) => plotBottom - ((value / maxValue) * plotHeight);
  const labelIndexes = getHistoryLabelIndexes(dates.length);
  const yValues = [maxValue, maxValue / 2, 0];
  const buildPoint = (dateIndex: number, y: number, cursorX = getX(dateIndex)): HistoryPointTooltip => {
    const entry = valuesByDate.get(dates[dateIndex]);
    return {
      chartWidth: width,
      chartHeight: height,
      x: cursorX,
      y,
      date: formatHistoryTooltipDate(dates[dateIndex], granularity),
      lines: [{
        label: 'Collection value',
        value: entry ? formatMarketPrice(entry.value) : 'N/A',
        color: '#6ee7b7',
      }],
      detail: entry ? `${entry.pricedCopies} cards priced` : 'No captured snapshot',
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pointer = getChartPointerPosition(event, width, height, plotLeft, plotTop, plotRight, plotBottom);
    if (!pointer) return;
    const dateIndex = getNearestHistoryIndex(pointer.x, dates.length, getX);
    setHoveredPoint(buildPoint(dateIndex, pointer.y, pointer.x));
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/50 p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <span className="inline-flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Collection value
        </span>
        <span className="text-[0.65rem] font-semibold text-slate-500">USD · saved inventory</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Riftbound collection market value history line graph"
          className="h-[270px] min-w-[36rem] w-full"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredPoint(null)}
        >
          {yValues.map((value) => {
            const y = getY(value);
            return (
              <g key={value}>
                <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
                <text x={plotLeft - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatMarketPrice(value)}</text>
              </g>
            );
          })}
          <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="rgba(148,163,184,0.3)" />
          {buildHistoryLineSegments(values, getX, getY).map((points, index) => (
            <polyline key={index} points={points} fill="none" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {values.map((value, index) => value === null ? null : (() => {
            const point = buildPoint(index, getY(value));
            return <circle
              key={dates[index]}
              cx={point.x}
              cy={getY(value)}
              r="6"
              fill="#030712"
              stroke="#6ee7b7"
              strokeWidth="2"
              tabIndex={0}
              role="img"
              aria-label={`${formatMarketPrice(value)} - ${point.date}; ${point.detail}`}
              onFocus={() => setHoveredPoint(point)}
              onBlur={() => setHoveredPoint(null)}
            />;
          })())}
          {hoveredPoint ? (
            <HistoryCrosshair
              point={hoveredPoint}
              plotLeft={plotLeft}
              plotTop={plotTop}
              plotRight={plotRight}
              plotBottom={plotBottom}
              yValue={Math.max(0, Math.min(maxValue, maxValue * ((plotBottom - hoveredPoint.y) / plotHeight)))}
            />
          ) : null}
          {labelIndexes.map((index) => (
            <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill={hoveredPoint?.date === formatHistoryTooltipDate(dates[index], granularity) ? '#fcd34d' : '#64748b'} fontSize="11">{formatHistoryDate(dates[index], granularity)}</text>
          ))}
        </svg>
        {hoveredPoint ? <HistoryChartTooltip point={hoveredPoint} /> : null}
      </div>
    </div>
  );
}
