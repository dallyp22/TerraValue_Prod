import { Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapCentricHome from "@/components/MapCentricHome";
import AuctionDiagnostics from "@/pages/auction-diagnostics";
import TestParcels from "@/pages/test-parcels";
import TestHarrisonTileset from "@/pages/test-harrison-tileset";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Route path="/" component={MapCentricHome} />
        <Route path="/auction-diagnostics" component={AuctionDiagnostics} />
        <Route path="/test-parcels" component={TestParcels} />
        <Route path="/test-harrison" component={TestHarrisonTileset} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
