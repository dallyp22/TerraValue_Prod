import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Gavel, Search, MapPin, Ruler, Sprout, ExternalLink, CalendarClock, Settings, Layers, Calculator, Loader2,
} from "lucide-react";
import { useAuctionValuation } from "@/hooks/use-auction-valuation";

interface Auction {
  id: number;
  title: string;
  url: string;
  sourceWebsite: string;
  auctionDate: string | null;
  auctionType: string | null;
  county: string | null;
  state: string | null;
  acreage: number | null;
  landType: string | null;
  latitude: number | null;
  longitude: number | null;
  csr2Mean: number | null;
  estimatedValue: number | null;
  needsDateReview: boolean | null;
  estValuePerAcre?: number | null;
  estTotalValue?: number | null;
}

const RANGES = [
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "all", label: "All upcoming" },
];
const SORTS = [
  { value: "date", label: "Soonest" },
  { value: "acreage", label: "Largest" },
  { value: "csr2", label: "Highest CSR2" },
  { value: "county", label: "County A–Z" },
];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function countdownLabel(days: number | null): { text: string; tone: string } {
  if (days == null) return { text: "Date TBD", tone: "bg-warm-100 text-warm-600" };
  if (days <= 0) return { text: "Today", tone: "bg-red-100 text-red-700" };
  if (days === 1) return { text: "Tomorrow", tone: "bg-amber-100 text-amber-700" };
  if (days <= 7) return { text: `In ${days} days`, tone: "bg-amber-100 text-amber-700" };
  if (days <= 30) return { text: `In ${days} days`, tone: "bg-field/10 text-field" };
  return { text: `In ${days} days`, tone: "bg-warm-100 text-warm-600" };
}

export default function AuctionsBrowser() {
  const { startValuation, preparingId, overlays } = useAuctionValuation();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("Iowa");
  const [county, setCounty] = useState("all");
  const [landType, setLandType] = useState("all");
  const [range, setRange] = useState("all");
  const [sort, setSort] = useState("date");

  const { data, isLoading } = useQuery<{ auctions: Auction[] }>({
    queryKey: ["/api/auctions/upcoming"],
    queryFn: async () => (await fetch("/api/auctions/upcoming")).json(),
  });

  const all = data?.auctions || [];

  const states = useMemo(
    () => Array.from(new Set(all.map((a) => a.state).filter(Boolean) as string[])).sort(),
    [all],
  );
  // Counties list reflects the active state filter.
  const counties = useMemo(
    () => Array.from(new Set(all
      .filter((a) => stateFilter === "all" || a.state === stateFilter)
      .map((a) => a.county).filter(Boolean) as string[])).sort(),
    [all, stateFilter],
  );
  const landTypes = useMemo(
    () => Array.from(new Set(all.map((a) => a.landType).filter(Boolean) as string[])).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = all.filter((a) => {
      if (q && !(`${a.title} ${a.county ?? ""}`.toLowerCase().includes(q))) return false;
      if (stateFilter !== "all" && a.state !== stateFilter) return false;
      if (county !== "all" && a.county !== county) return false;
      if (landType !== "all" && a.landType !== landType) return false;
      if (range !== "all") {
        const d = daysUntil(a.auctionDate);
        if (d == null || d > parseInt(range, 10)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "acreage": return (b.acreage ?? 0) - (a.acreage ?? 0);
        case "csr2": return (b.csr2Mean ?? 0) - (a.csr2Mean ?? 0);
        case "county": return (a.county ?? "").localeCompare(b.county ?? "");
        default: return new Date(a.auctionDate ?? 0).getTime() - new Date(b.auctionDate ?? 0).getTime();
      }
    });
    return rows;
  }, [all, search, stateFilter, county, landType, range, sort]);

  // If the selected county isn't in the active state, reset it.
  const countyValue = counties.includes(county) ? county : "all";

  return (
    <div className="min-h-screen bg-wheat-cream">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Title + admin link */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-slate-800 flex items-center gap-2">
              <Gavel className="h-7 w-7 text-field" /> Upcoming Land Auctions
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isLoading ? "Loading…" : `${filtered.length} of ${all.length} upcoming farmland auctions`}
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" /> Manage
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search title or county…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCounty("all"); }}>
            <SelectTrigger className="w-[130px] bg-white"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={countyValue} onValueChange={setCounty}>
            <SelectTrigger className="w-[150px] bg-white"><SelectValue placeholder="County" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All counties</SelectItem>
              {counties.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {landTypes.length > 0 && (
            <Select value={landType} onValueChange={setLandType}>
              <SelectTrigger className="w-[140px] bg-white"><SelectValue placeholder="Land type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {landTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-slate-500">
            No upcoming auctions match your filters.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((a) => {
              const days = daysUntil(a.auctionDate);
              const cd = countdownLabel(days);
              return (
                <Card key={a.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex flex-col h-full">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-semibold text-slate-800">
                        {a.county ? `${a.county} County` : "Unknown county"}
                        {a.state && a.state !== "Iowa" ? <span className="text-slate-400 font-normal">, {a.state}</span> : null}
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${cd.tone}`}>{cd.text}</span>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 mb-3" title={a.title}>{a.title}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 mb-3">
                      {a.acreage ? <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{Math.round(a.acreage)} ac</span> : null}
                      {a.csr2Mean ? <span className="inline-flex items-center gap-1"><Sprout className="h-3.5 w-3.5 text-field" />CSR2 {a.csr2Mean.toFixed(0)}</span> : null}
                      {a.landType ? <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{a.landType}</span> : null}
                      {a.latitude && a.longitude ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Mapped</span> : null}
                    </div>

                    {a.estValuePerAcre ? (
                      <div className="rounded-lg bg-field/5 border border-field/10 px-3 py-2 mb-3">
                        <div className="text-[11px] uppercase tracking-wide text-field/80">Est. value</div>
                        <div className="text-sm font-semibold text-slate-800">
                          ${a.estValuePerAcre.toLocaleString()}<span className="text-xs font-normal text-slate-500">/ac</span>
                          {a.estTotalValue ? <span className="text-slate-400 font-normal"> · ~${a.estTotalValue.toLocaleString()} total</span> : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-auto pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {a.auctionDate ? new Date(a.auctionDate).toLocaleDateString() : "Date TBD"}
                          {a.needsDateReview ? <span className="text-amber-600">(unconfirmed)</span> : null}
                        </div>
                        <a
                          href={a.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-medium text-field hover:underline inline-flex items-center gap-1"
                        >
                          Listing <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <Button
                        size="sm"
                        disabled={preparingId === a.id}
                        className="w-full bg-field hover:bg-field-spring text-wheat-cream gap-1.5"
                        onClick={() => startValuation(a)}
                      >
                        {preparingId === a.id ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Valuing…</>
                        ) : (
                          <><Calculator className="h-3.5 w-3.5" /> Value this auction</>
                        )}
                      </Button>
                      <div className="text-[11px] text-slate-400 truncate">{a.sourceWebsite}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      {overlays}
    </div>
  );
}
