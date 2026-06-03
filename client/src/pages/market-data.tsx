import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Landmark, Ruler, Layers, ArrowUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types matching the /api/market/* responses
// ---------------------------------------------------------------------------
interface MarketSummary {
  totalSales: number;
  totalAcres: number | null;
  avgPerAcre: number | null;
  medianPerCsr2: number | null;
  latestMonth: string | null;
  latestAvgPerAcre: number | null;
  yoyPct: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}
interface TimeseriesPoint {
  month: string;
  avgPerAcre: number | null;
  medianPerAcre: number | null;
  avgPerCsr2: number | null;
  saleCount: number;
  acres: number | null;
}
interface SaleRow {
  id: number;
  sale_date: string | null;
  county: string;
  land_type_raw: string | null;
  land_category: string | null;
  sold_acres: number | null;
  price_per_acre: number | null;
  sale_status: string;
  tillable_csr2: number | null;
  dollar_per_tillable_csr2: number | null;
}

// ---------------------------------------------------------------------------
const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString();
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
};

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const LAND_TYPES = [
  { value: "all", label: "All land" },
  { value: "tillable", label: "Tillable" },
  { value: "pasture", label: "Pasture" },
  { value: "crp", label: "CRP" },
  { value: "recreational", label: "Recreational" },
];
const RANGES = [
  { value: "12", label: "Last 12 mo" },
  { value: "24", label: "Last 24 mo" },
  { value: "all", label: "All time" },
];

function rangeToDateFrom(range: string): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  d.setMonth(d.getMonth() - parseInt(range, 10));
  return d.toISOString().slice(0, 10);
}

export default function MarketData() {
  const [landCategory, setLandCategory] = useState("all");
  const [range, setRange] = useState("all");
  const [metric, setMetric] = useState<"avgPerAcre" | "avgPerCsr2">("avgPerAcre");
  const [sortBy, setSortBy] = useState("sale_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const filterParams = {
    landCategory: landCategory === "all" ? undefined : landCategory,
    dateFrom: rangeToDateFrom(range),
  };

  const summary = useQuery<MarketSummary>({
    queryKey: ["/api/market/summary", filterParams],
    queryFn: async () => {
      const r = await fetch(`/api/market/summary${buildQuery(filterParams)}`);
      return (await r.json()).summary;
    },
  });

  const series = useQuery<TimeseriesPoint[]>({
    queryKey: ["/api/market/timeseries", filterParams],
    queryFn: async () => {
      const r = await fetch(`/api/market/timeseries${buildQuery(filterParams)}`);
      return (await r.json()).series;
    },
  });

  const pageSize = 25;
  const sales = useQuery<{ rows: SaleRow[]; total: number }>({
    queryKey: ["/api/market/sales", filterParams, sortBy, sortDir, page],
    queryFn: async () => {
      const r = await fetch(
        `/api/market/sales${buildQuery({
          ...filterParams,
          sortBy,
          sortDir,
          limit: String(pageSize),
          offset: String(page * pageSize),
        })}`,
      );
      return await r.json();
    },
  });

  const s = summary.data;
  const yoy = s?.yoyPct;

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  };

  const totalPages = sales.data ? Math.ceil(sales.data.total / pageSize) : 0;

  return (
    <div className="min-h-screen bg-wheat-cream">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Title + filters */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-slate-800">Iowa Land Market</h1>
            <p className="text-sm text-slate-500 mt-1">
              {s ? `${fmtNum(s.totalSales)} comparable sales` : "Loading…"}
              {s?.dateFrom && s?.dateTo ? ` · ${s.dateFrom} – ${s.dateTo}` : ""} · Source: Iowa Appraisal — Land Talk Monthly
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={landCategory} onValueChange={(v) => { setLandCategory(v); setPage(0); }}>
              <SelectTrigger className="w-[150px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAND_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => { setRange(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Landmark className="h-4 w-4" />}
            label={s?.latestMonth ? `Avg $/acre · ${fmtMonth(s.latestMonth)}` : "Avg $/acre"}
            value={fmtUsd(s?.latestAvgPerAcre)}
            loading={summary.isLoading}
            footer={
              yoy != null ? (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${yoy >= 0 ? "text-field" : "text-red-600"}`}>
                  {yoy >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {(yoy * 100).toFixed(1)}% YoY
                </span>
              ) : null
            }
          />
          <KpiCard icon={<Layers className="h-4 w-4" />} label="Median $/CSR2 point" value={fmtUsd(s?.medianPerCsr2)} loading={summary.isLoading} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Sales tracked" value={fmtNum(s?.totalSales)} loading={summary.isLoading} />
          <KpiCard icon={<Ruler className="h-4 w-4" />} label="Total acres" value={fmtNum(s?.totalAcres)} loading={summary.isLoading} />
        </div>

        {/* Price trend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold text-slate-700">Price trend</CardTitle>
            <ToggleGroup type="single" value={metric} onValueChange={(v) => v && setMetric(v as any)} size="sm">
              <ToggleGroupItem value="avgPerAcre" className="text-xs">$/acre</ToggleGroupItem>
              <ToggleGroupItem value="avgPerCsr2" className="text-xs">$/CSR2 pt</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {series.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series.data || []} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(94 54% 28%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(94 54% 28%)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e1d4" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: "#94918a" }} minTickGap={24} />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(metric === "avgPerCsr2" ? 0 : 1)}${metric === "avgPerCsr2" ? "" : "k"}`} tick={{ fontSize: 11, fill: "#94918a" }} width={48} />
                    <Tooltip
                      formatter={(v: any) => [fmtUsd(v), metric === "avgPerCsr2" ? "$/CSR2 pt" : "$/acre"]}
                      labelFormatter={(l) => fmtMonth(l as string)}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e7e1d4", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey={metric} stroke="hsl(94 54% 24%)" strokeWidth={2} fill="url(#g)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent sales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-700">Recent sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Date" col="sale_date" {...{ sortBy, sortDir, toggleSort }} />
                    <SortHead label="County" col="county" {...{ sortBy, sortDir, toggleSort }} />
                    <TableHead>Type</TableHead>
                    <SortHead label="Acres" col="sold_acres" right {...{ sortBy, sortDir, toggleSort }} />
                    <SortHead label="$/acre" col="price_per_acre" right {...{ sortBy, sortDir, toggleSort }} />
                    <SortHead label="CSR2" col="tillable_csr2" right {...{ sortBy, sortDir, toggleSort }} />
                    <TableHead className="text-right">$/CSR2</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                    ))
                  ) : (
                    (sales.data?.rows || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-slate-600">{r.sale_date ? new Date(r.sale_date).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="font-medium text-slate-800">{r.county}</TableCell>
                        <TableCell className="text-slate-500 text-xs">{r.land_type_raw || r.land_category || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sold_acres ? Math.round(r.sold_acres) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {r.sale_status === "sold" && r.price_per_acre != null
                            ? fmtUsd(r.price_per_acre)
                            : <Badge variant="outline" className="text-[10px] font-normal capitalize">{r.sale_status.replace("_", " ")}</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{r.tillable_csr2 ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{fmtUsd(r.dollar_per_tillable_csr2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
              <span>{sales.data ? `${fmtNum(sales.data.total)} sales` : ""}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs">Page {page + 1}{totalPages ? ` of ${totalPages}` : ""}</span>
                <Button variant="outline" size="sm" disabled={totalPages > 0 && page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, footer, loading }: {
  icon: React.ReactNode; label: string; value: string; footer?: React.ReactNode; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wide">
          {icon}{label}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-28 mt-2" />
        ) : (
          <div className="text-2xl font-semibold text-slate-800 mt-1.5">{value}</div>
        )}
        {footer ? <div className="mt-1">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

function SortHead({ label, col, right, sortBy, sortDir, toggleSort }: {
  label: string; col: string; right?: boolean;
  sortBy: string; sortDir: string; toggleSort: (c: string) => void;
}) {
  const active = sortBy === col;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <button
        className={`inline-flex items-center gap-1 hover:text-slate-800 ${active ? "text-slate-800 font-semibold" : ""}`}
        onClick={() => toggleSort(col)}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
        {active ? <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </TableHead>
  );
}
