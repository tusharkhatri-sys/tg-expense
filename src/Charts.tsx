import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export type ChartPoint = {
  month: string;
  expense: number;
  bank?: number;
  cash?: number;
};

export type CategoryPoint = {
  name: string;
  value: number;
};

const DONUT_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#f43f5e',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6'
];

function GlassTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  const heading = label || payload[0]?.name || '';
  return (
    <div className="chart-glass-tooltip">
      {heading && <div className="tooltip-title">{heading}</div>}
      {payload.map((entry: any, idx: number) => (
        <div className="tooltip-row" key={entry.dataKey || entry.name || idx}>
          <span
            className="tooltip-dot"
            style={{ background: entry.color || entry.payload?.fill || '#6366f1' }}
          />
          <span className="tooltip-name">{entry.name}:</span>
          <strong>{money(Number(entry.value || 0))}</strong>
        </div>
      ))}
    </div>
  );
}

export function MonthlyChart({
  data,
  money
}: {
  data: ChartPoint[];
  money: (value: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}>
        <defs>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--muted)', fontSize: 11, fontWeight: 500 }}
          dy={6}
        />
        <YAxis hide />
        <Tooltip content={<GlassTooltip money={money} />} />
        <Area
          dataKey="expense"
          name="Expenses"
          type="monotone"
          stroke="#f43f5e"
          fill="url(#expenseGrad)"
          strokeWidth={2.5}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsChart({
  data,
  categories = [],
  money
}: {
  data: ChartPoint[];
  categories?: CategoryPoint[];
  money: (value: number) => string;
}) {
  const [mode, setMode] = useState<'area' | 'donut' | 'bar'>('area');

  const totalCategorySpend = Math.round(categories.reduce((s, c) => s + c.value, 0) * 100) / 100;
  const totalBankSpend = Math.round(data.reduce((s, d) => s + (d.bank || 0), 0) * 100) / 100;
  const totalCashSpend = Math.round(data.reduce((s, d) => s + (d.cash || 0), 0) * 100) / 100;

  const formatAxis = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v);

  return (
    <div className="analytics-chart-wrap">
      <div className="chart-mode-switcher" role="tablist" aria-label="Chart view mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'area'}
          className={mode === 'area' ? 'chart-mode-btn active' : 'chart-mode-btn'}
          onClick={() => setMode('area')}
        >
          Area Curve
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'donut'}
          className={mode === 'donut' ? 'chart-mode-btn active' : 'chart-mode-btn'}
          onClick={() => setMode('donut')}
        >
          Category Donut
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'bar'}
          className={mode === 'bar' ? 'chart-mode-btn active' : 'chart-mode-btn'}
          onClick={() => setMode('bar')}
        >
          Bank vs. Cash
        </button>
      </div>

      {mode === 'area' && (
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data} margin={{ left: -8, right: 12, top: 14, bottom: 0 }}>
              <defs>
                <linearGradient id="analyticsExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11, fontWeight: 500 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                width={48}
                tickFormatter={formatAxis}
              />
              <Tooltip content={<GlassTooltip money={money} />} />
              <Area
                dataKey="expense"
                name="Expenses"
                type="monotone"
                stroke="#8b5cf6"
                fill="url(#analyticsExpense)"
                strokeWidth={2.75}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {mode === 'donut' && (
        <div className="donut-chart-layout">
          {categories.length > 0 ? (
            <>
              <div className="donut-ring-box">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Tooltip content={<GlassTooltip money={money} />} />
                    <Pie
                      data={categories}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="86%"
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="none"
                    >
                      {categories.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={DONUT_COLORS[idx % DONUT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center-label">
                  <small>Total Spent</small>
                  <strong>{money(totalCategorySpend)}</strong>
                </div>
              </div>
              <div className="donut-legend-grid">
                {categories.map((c, idx) => {
                  const pct =
                    totalCategorySpend > 0 ? Math.round((c.value / totalCategorySpend) * 100) : 0;
                  return (
                    <div className="donut-legend-item" key={c.name}>
                      <span
                        className="donut-color-dot"
                        style={{ background: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                      />
                      <span className="donut-cat-name">{c.name}</span>
                      <small className="donut-cat-pct">{pct}%</small>
                      <b className="donut-cat-val">{money(c.value)}</b>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="chart-empty compact">
              <b>No category expenses in this period</b>
              <small>Record expenses to view your category donut ring.</small>
            </div>
          )}
        </div>
      )}

      {mode === 'bar' && (
        <div className="bar-chart-layout">
          <div className="bar-summary-pills">
            <span className="bar-stat-pill bank">
              <i /> Bank / UPI: <b>{money(totalBankSpend)}</b>
            </span>
            <span className="bar-stat-pill cash">
              <i /> Cash Wallet: <b>{money(totalCashSpend)}</b>
            </span>
          </div>
          <div className="chart tall">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={data} margin={{ left: -8, right: 12, top: 14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 6" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11, fontWeight: 500 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  width={48}
                  tickFormatter={formatAxis}
                />
                <Tooltip content={<GlassTooltip money={money} />} />
                <Bar
                  dataKey="bank"
                  name="Bank / UPI"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="cash"
                  name="Cash"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
