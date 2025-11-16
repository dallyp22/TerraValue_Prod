import { Link } from "wouter";
import { ChartLine, Bell, User, Gavel } from "lucide-react";

export function Header() {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="flex justify-between items-center h-16 sm:h-18">
          <div className="flex items-center space-x-3">
            <div className="bg-slate-900 p-2.5 rounded-2xl">
              <ChartLine className="text-white h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-light text-slate-900 tracking-wide">FarmScope AI</h1>
              <p className="text-xs text-slate-500 hidden sm:block font-light">AI-Powered Agricultural Valuation</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex space-x-8">
            <Link href="/" className="text-slate-900 font-light hover:text-slate-600 transition-colors duration-200">
              Valuation Tool
            </Link>
            <Link href="/auction-diagnostics" className="text-slate-500 font-light hover:text-slate-900 transition-colors duration-200 flex items-center gap-1">
              <Gavel className="h-4 w-4" />
              Auctions
            </Link>
          </nav>
          
          {/* Mobile & Desktop Actions */}
          <div className="flex items-center space-x-3">
            <button className="text-slate-400 hover:text-slate-600 transition-colors duration-200 p-2">
              <Bell className="h-5 w-5" />
            </button>
            <div className="w-9 h-9 bg-slate-100 rounded-2xl flex items-center justify-center">
              <User className="text-slate-600 h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
