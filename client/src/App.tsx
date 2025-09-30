import { Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MapCentricHome from "@/components/MapCentricHome";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Route path="/" component={MapCentricHome} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
