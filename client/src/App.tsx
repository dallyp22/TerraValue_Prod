import { Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapCentricHome from "@/components/MapCentricHome";
import AuctionDiagnosticsTerra from "@/pages/AuctionDiagnosticsTerra";
import AuctionsBrowser from "@/pages/auctions";
import MarketData from "@/pages/market-data";
import ValuationsHistory from "@/pages/valuations";
import TestParcels from "@/pages/test-parcels";
import TestHarrisonTileset from "@/pages/test-harrison-tileset";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Route path="/" component={MapCentricHome} />
        <Route path="/auctions" component={AuctionsBrowser} />
        <Route path="/admin" component={AuctionDiagnosticsTerra} />
        {/* Legacy path → admin console (kept intact) */}
        <Route path="/auction-diagnostics" component={AuctionDiagnosticsTerra} />
        <Route path="/market-data" component={MarketData} />
        <Route path="/valuations" component={ValuationsHistory} />
        <Route path="/test-parcels" component={TestParcels} />
        <Route path="/test-harrison" component={TestHarrisonTileset} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
