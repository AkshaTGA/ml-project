// Agent-made charts. Loaded lazily: recharts is only downloaded when an answer contains a chart.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

export const PALETTE = ['var(--c-brand)', 'var(--c-gold)', 'var(--c-sky)', 'var(--c-earth)', 'var(--c-lilac-ink)', 'var(--c-danger)']

const axis = { stroke: 'var(--c-muted)', fontSize: 12, tickLine: false, axisLine: false }
const tooltipStyle = {
  contentStyle: { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, fontSize: 13 },
  labelStyle: { color: 'var(--c-ink)', fontWeight: 600 },
}

export default function ChartBlock({ spec }) {
  const kind = spec.kind || 'bar'
  const x = spec.x || 'label'
  const data = spec.data || []
  const series = spec.series?.length
    ? spec.series
    : Object.keys(data[0] || {}).filter((k) => k !== x && typeof data[0][k] === 'number').map((key) => ({ key }))
  const unit = spec.unit ? ` ${spec.unit}` : ''
  const fmt = (v) => (typeof v === 'number' ? `${v.toLocaleString('en-IN')}${unit}` : v)
  const colorOf = (s, i) => s.color || PALETTE[i % PALETTE.length]

  if (kind === 'pie' || kind === 'donut') {
    const key = series[0]?.key || 'value'
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey={key} nameKey={x} innerRadius={kind === 'donut' ? 60 : 0} outerRadius={95}
            paddingAngle={2} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--c-surface)" />)}
          </Pie>
          <Tooltip formatter={fmt} {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const Chart = kind === 'line' ? LineChart : kind === 'area' ? AreaChart : BarChart
  return (
    <ResponsiveContainer width="100%" height={260}>
      <Chart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} width={48} tickFormatter={(v) => v.toLocaleString('en-IN')} />
        <Tooltip formatter={fmt} cursor={{ fill: 'var(--c-surface-2)' }} {...tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => {
          const color = colorOf(s, i)
          const name = s.label || s.key
          if (kind === 'line') return <Line key={s.key} dataKey={s.key} name={name} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
          if (kind === 'area') return <Area key={s.key} dataKey={s.key} name={name} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} type="monotone" />
          return <Bar key={s.key} dataKey={s.key} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={44} />
        })}
      </Chart>
    </ResponsiveContainer>
  )
}
