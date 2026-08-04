import type { CSSProperties } from "react";
import "./BarChart.css";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  items: BarChartItem[];
}

const DEFAULT_COLORS = [
  "var(--color-groseille)",
  "var(--color-autumn-orange)",
  "var(--color-blush-deep)",
  "var(--color-brown)",
  "var(--color-blush)",
];

export function BarChart({ items }: BarChartProps) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value));

  return (
    <div className="bar-chart">
      {items.map((item, i) => (
        <div key={item.label} className="bar-chart__row">
          <span className="bar-chart__label">{item.label}</span>
          <div className="bar-chart__track">
            <div
              className="bar-chart__fill"
              style={
                {
                  width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                  "--bar-color": item.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                } as CSSProperties
              }
            />
          </div>
          <span className="bar-chart__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
