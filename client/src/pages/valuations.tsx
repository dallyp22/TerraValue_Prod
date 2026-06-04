import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, FileText, MapPin, Ruler, ChevronRight } from "lucide-react";
import ValuationReportOverlay from "@/components/ValuationReportOverlay";
import type { Valuation } from "@shared/schema";

interface ValuationSummary {
  id: number;
  address: string | null;
  county: string | null;
  state: string | null;
  landType: string | null;
  acreage: number | null;
  adjustedValue: number | null;
  totalValue: number | null;
  confidenceScore: number | null;
  status: string;
  createdAt: string | null;
}

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

const STATUS_TONE: Record<string, string> = {
  completed: "bg-field/10 text-field",
  processing: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export default function ValuationsHistory() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ valuations: ValuationSummary[] }>({
    queryKey: ["/api/valuations/history"],
    queryFn: async () => (await fetch("/api/valuations/history")).json(),
  });

  // Full valuation for the report overlay (fetched on demand).
  const { data: openData } = useQuery<{ valuation: Valuation }>({
    queryKey: ["/api/valuations", openId],
    queryFn: async () => (await fetch(`/api/valuations/${openId}`)).json(),
    enabled: openId != null,
  });

  const all = data?.valuations || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((v) => `${v.address ?? ""} ${v.county ?? ""} ${v.landType ?? ""}`.toLowerCase().includes(q));
  }, [all, search]);

  return (
    <div className="min-h-screen bg-wheat-cream">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-serif text-slate-800 flex items-center gap-2">
              <FileText className="h-7 w-7 text-field" /> Your Valuations
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isLoading ? "Loading…" : `${filtered.length} valuation${filtered.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search location or type…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-slate-500">
            No valuations yet. Run one from the map or an auction.
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-slate-100">
              {filtered.map((v) => (
                <button
                  key={v.id}
                  onClick={() => v.status === "completed" && setOpenId(v.id)}
                  disabled={v.status !== "completed"}
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-default"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {v.county ? `${v.county} County` : v.address || "Valuation"}
                      {v.state && v.state !== "Iowa" ? <span className="text-slate-400 font-normal">, {v.state}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{v.address || "—"}</span>
                      {v.acreage ? <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />{Math.round(v.acreage)} ac</span> : null}
                      {v.landType ? <span>{v.landType}</span> : null}
                      {v.createdAt ? <span>{new Date(v.createdAt).toLocaleDateString()}</span> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-900 tabular-nums">{usd(v.totalValue)}</div>
                    <div className="text-xs text-slate-500 tabular-nums">{usd(v.adjustedValue)}/ac</div>
                  </div>
                  {v.status !== "completed" ? (
                    <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_TONE[v.status] || ""}`}>{v.status}</Badge>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      {openId != null && openData?.valuation && (
        <ValuationReportOverlay data={openData.valuation} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
