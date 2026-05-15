"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { SectionCard } from "@/components/shared";
import { useEffect, useState } from "react";

interface SalesData {
  date: string;
  total: number;
}

interface CategoryData {
  name: string;
  value: number;
}

const CHART_COLORS = [
  "#104e98", "#0b3d7a", "#22c55e", "#f59e0b",
  "#ef4444", "#8b5cf6", "#06b6d4", "#f97316",
];

export function DashboardCharts() {
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/charts")
      .then((r) => r.json())
      .then((d) => {
        if (d.sales) setSalesData(d.sales);
        if (d.categories) setCategoryData(d.categories);
      })
      .catch(() => {
        // Fallback demo data
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push({
            date: d.toLocaleDateString("ar", { weekday: "short" }),
            total: Math.floor(Math.random() * 3000) + 500,
          });
        }
        setSalesData(days);
        setCategoryData([
          { name: "هواتف", value: 45 },
          { name: "لابتوب", value: 25 },
          { name: "إكسسوارات", value: 20 },
          { name: "مراقبة", value: 10 },
        ]);
      });
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Bar chart — sales last 7 days */}
      <SectionCard
        title="مبيعات آخر 7 أيام"
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={salesData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              orientation="right"
              tickFormatter={(v) => `₪${v}`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
              formatter={(value) => [`₪ ${value}`, "المبيعات"]}
            />
            <Bar dataKey="total" fill="#104e98" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* Donut chart — category distribution */}
      <SectionCard title="توزيع المبيعات حسب الفئة">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {categoryData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(value) => [`${value}%`, ""]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </SectionCard>
    </div>
  );
}
