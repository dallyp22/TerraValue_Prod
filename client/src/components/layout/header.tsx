import { Link, useLocation } from "wouter";
import { MapPin, Bell, User, Gavel, Search, Command } from "lucide-react";
import { Button } from "@/components/ui/button";

// TerraValue Logo - Stylized contour lines forming a "T"
function TerraLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      {/* Background circle */}
      <circle cx="16" cy="16" r="16" className="fill-field" />
      {/* Contour lines forming abstract "T" */}
      <path
        d="M8 10 Q16 8 24 10"
        stroke="#e8dcc4"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M6 14 Q16 12 26 14"
        stroke="#e8dcc4"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M8 18 Q16 16 24 18"
        stroke="#e8dcc4"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Vertical line of T */}
      <path
        d="M16 12 L16 26"
        stroke="#faf6ed"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Horizontal line of T */}
      <path
        d="M10 12 L22 12"
        stroke="#faf6ed"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Header() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Map", icon: MapPin },
    { href: "/auction-diagnostics", label: "Auctions", icon: Gavel },
  ];

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-warm-200 sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-14">
          {/* Logo & Wordmark */}
          <Link href="/" className="flex items-center gap-3 group">
            <TerraLogo />
            <div className="hidden sm:block">
              <h1 className="font-display text-lg text-terra-black tracking-tight group-hover:text-field transition-colors">
                TerraValue
              </h1>
              <p className="text-[10px] text-warm-500 font-medium uppercase tracking-widest -mt-0.5">
                Iowa Land Intelligence
              </p>
            </div>
          </Link>

          {/* Center Navigation - Desktop */}
          <nav className="hidden lg:flex items-center gap-1 bg-warm-100 rounded-lg p-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = location === href;
              return (
                <Link key={href} href={href}>
                  <button
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                      ${isActive
                        ? "bg-white text-terra-black shadow-sm"
                        : "text-warm-600 hover:text-terra-black hover:bg-white/50"
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Search Trigger - Desktop */}
            <Button
              variant="terra-ghost"
              size="sm"
              className="hidden md:flex items-center gap-2 text-warm-500"
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">Search</span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-warm-100 rounded text-[10px] text-warm-500 font-mono">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </Button>

            {/* Notifications */}
            <Button variant="terra-ghost" size="icon-sm" className="text-warm-500">
              <Bell className="h-4 w-4" />
            </Button>

            {/* User Menu */}
            <button className="w-8 h-8 bg-field rounded-full flex items-center justify-center hover:bg-field-spring transition-colors">
              <User className="text-wheat-cream h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Subtle contour line decoration at bottom */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-warm-200 to-transparent" />
    </header>
  );
}
