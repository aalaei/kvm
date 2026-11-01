import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import CustomTooltip, { CustomTooltipProps } from "@components/CustomTooltip";
import { primary_color, primary_dark_color } from "@/layout/theme_color";
import { useThemeSettings } from "@routes/login_page/useLocalAuth";

export default function StatChart({
                                    data,
                                    domain,
                                    unit,
                                    referenceValue,
                                  }: {
  data: { date: number; stat: number | null | undefined }[];
  domain?: [string | number, string | number];
  unit?: string;
  referenceValue?: number;
}) {
  const { isDark } = useThemeSettings();
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data} margin={{ top: 24, right: 20, left: -10, bottom: 20 }}>
          <Brush startIndex={data.length - 60 * 2} height={1} className="hidden" />
          <CartesianGrid
            strokeDasharray={0}
            vertical={false}
            strokeLinecap="butt"
            stroke="rgba(30, 41, 59, 0.1)"
          />
          {referenceValue && (
            <ReferenceLine
              y={referenceValue}
              strokeDasharray="3 3"
              strokeWidth={1}
              stroke="rgba(30, 41, 59, 0.3)"
            />
          )}
          <XAxis
            dataKey="date"
            tick={{
              fontFamily: "Circular",
              fontSize: "12px",
              fill: "rgba(107, 114, 128, 1)",
            }}
            axisLine={{ stroke: "rgba(30, 41, 59, 0.3)" }}
            tickLine={{ stroke: "rgba(30, 41, 59, 0.3)" }}
            tickFormatter={date => {
              return new Date(date * 1000).toLocaleString("en-US", {
                hourCycle: "h23",
                hour: "numeric",
                minute: "2-digit",
              });
            }}
            ticks={data
              .filter(d => {
                return d.date % 60 === 0;
              })
              .map(x => x.date)}
          />
          <YAxis
            dataKey="stat"
            axisLine={false}
            orientation="left"
            tick={{
              fontFamily: "Circular",
              fontSize: "12px",
              fill: "rgba(107, 114, 128, 1)",
            }}
            padding={{ top: 0, bottom: 0 }}
            tickLine={false}
            domain={domain || ["auto", "auto"]}
          />

          <Tooltip
            cursor={false}
            content={({ payload }) => {
              return <CustomTooltip payload={payload as CustomTooltipProps["payload"]} />;
            }}
          />
          <Line
            type="monotone"
            isAnimationActive={false}
            dataKey="stat"
            stroke={isDark ? primary_dark_color : primary_color}
            strokeLinecap="round"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {unit && (
        <div style={{
          position: "absolute",
          left: "20px",
          bottom: "8px",
          fontSize: "12px",
          color: "rgba(107, 114, 128, 1)",
          fontFamily: "Circular",
          padding: "2px 6px",
          borderRadius: "4px",
        }}>
          {unit}
        </div>
      )}
    </div>
  );
}