import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar,
  MapPin,
  Ruler,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Map,
  TrendingUp,
  Database,
  RefreshCw,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Edit2,
  Save,
  X,
  Archive,
  Wheat,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  BarChart3,
  Layers,
  Zap,
} from 'lucide-react';

// FarmScope AI styled metric card
function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  variant = 'default',
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'field' | 'gold';
  className?: string;
}) {
  const variantStyles = {
    default: 'bg-warm-50 border-warm-200',
    success: 'bg-field/5 border-field/20',
    warning: 'bg-gold/10 border-gold/30',
    field: 'bg-field/10 border-field/20',
    gold: 'bg-gold/10 border-gold/20',
  };

  const iconStyles = {
    default: 'bg-warm-100 text-warm-600',
    success: 'bg-field/20 text-field',
    warning: 'bg-gold/20 text-gold-dark',
    field: 'bg-field text-wheat-cream',
    gold: 'bg-gold text-terra-black',
  };

  return (
    <div className={cn('rounded-xl border p-4 transition-all hover:shadow-terra', variantStyles[variant], className)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', iconStyles[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-warm-500 font-medium uppercase tracking-wider">{label}</p>
          <p className="font-mono text-2xl font-bold text-terra-black truncate">{value}</p>
          {subValue && <p className="text-xs text-warm-500 mt-0.5">{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card-terra overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-warm-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-field" />
          </div>
          <span className="font-semibold text-terra-black">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 bg-gold/20 text-gold-dark text-xs font-mono rounded-full">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-warm-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-warm-400" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 border-t border-warm-100">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Source stat row component
function SourceStatRow({
  source,
  stats,
  isExpanded,
  onToggle,
  onViewAuctions,
}: {
  source: string;
  stats: any;
  isExpanded: boolean;
  onToggle: () => void;
  onViewAuctions: (source: string, category: string) => void;
}) {
  return (
    <div className="border border-warm-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-warm-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center">
            <Layers className="w-4 h-4 text-warm-600" />
          </div>
          <div className="text-left">
            <p className="font-medium text-terra-black text-sm truncate max-w-[200px]">{source}</p>
            <p className="text-xs text-warm-500">
              {stats.total_auctions} total • {stats.active_count} active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            {stats.upcoming_count > 0 && (
              <span className="px-2 py-1 bg-field/10 text-field text-xs font-medium rounded-full">
                {stats.upcoming_count} upcoming
              </span>
            )}
            {stats.needs_review > 0 && (
              <span className="px-2 py-1 bg-gold/20 text-gold-dark text-xs font-medium rounded-full">
                {stats.needs_review} review
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-warm-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-warm-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 border-t border-warm-100 bg-warm-50/50">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <button
                  onClick={() => onViewAuctions(source, 'active')}
                  className="p-3 bg-white rounded-lg border border-warm-200 hover:border-field hover:shadow-sm transition-all text-left"
                >
                  <p className="font-mono text-lg font-bold text-terra-black">{stats.active_count}</p>
                  <p className="text-xs text-warm-500">Active</p>
                </button>
                <button
                  onClick={() => onViewAuctions(source, 'upcoming')}
                  className="p-3 bg-white rounded-lg border border-warm-200 hover:border-field hover:shadow-sm transition-all text-left"
                >
                  <p className="font-mono text-lg font-bold text-field">{stats.upcoming_count}</p>
                  <p className="text-xs text-warm-500">Upcoming</p>
                </button>
                <button
                  onClick={() => onViewAuctions(source, 'needs_review')}
                  className="p-3 bg-white rounded-lg border border-warm-200 hover:border-gold hover:shadow-sm transition-all text-left"
                >
                  <p className="font-mono text-lg font-bold text-gold-dark">{stats.needs_review}</p>
                  <p className="text-xs text-warm-500">Needs Review</p>
                </button>
                <button
                  onClick={() => onViewAuctions(source, 'sold')}
                  className="p-3 bg-white rounded-lg border border-warm-200 hover:border-warm-400 hover:shadow-sm transition-all text-left"
                >
                  <p className="font-mono text-lg font-bold text-warm-600">{stats.sold_count}</p>
                  <p className="text-xs text-warm-500">Sold</p>
                </button>
              </div>
              <p className="text-xs text-warm-400 mt-3">
                Last scraped: {stats.last_scraped ? new Date(stats.last_scraped).toLocaleString() : 'Unknown'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Auction row component
function AuctionRow({
  auction,
  onBlock,
}: {
  auction: any;
  onBlock?: (url: string) => void;
}) {
  const statusColors: Record<string, string> = {
    active: 'bg-field/10 text-field border-field/20',
    sold: 'bg-warm-100 text-warm-600 border-warm-200',
    excluded: 'bg-red-50 text-red-600 border-red-200',
    upcoming: 'bg-gold/10 text-gold-dark border-gold/20',
  };

  const auctionDate = auction.auctionDate ? new Date(auction.auctionDate) : null;
  const isUpcoming = auctionDate && auctionDate >= new Date();

  return (
    <div className="p-4 bg-white rounded-xl border border-warm-200 hover:border-warm-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-terra-black truncate">{auction.title}</h4>
            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', statusColors[auction.status] || statusColors.active)}>
              {auction.status || 'active'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-warm-500">
            {auction.county && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {auction.county} County
              </span>
            )}
            {auctionDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {auctionDate.toLocaleDateString()}
                {isUpcoming && <span className="text-field font-medium">(Upcoming)</span>}
              </span>
            )}
            {auction.acres && (
              <span className="flex items-center gap-1">
                <Ruler className="w-3 h-3" />
                {auction.acres} acres
              </span>
            )}
          </div>
          {auction.sourceWebsite && (
            <p className="text-xs text-warm-400 mt-1 truncate">{auction.sourceWebsite}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {auction.url && (
            <a
              href={auction.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-warm-100 text-warm-500 hover:text-terra-black transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {onBlock && (
            <button
              onClick={() => onBlock(auction.url)}
              className="p-2 rounded-lg hover:bg-red-50 text-warm-400 hover:text-red-600 transition-colors"
              title="Block this auction"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function for relative time
function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Helper function for days until auction
function getDaysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function AuctionDiagnosticsTerra() {
  // Core state
  const [loading, setLoading] = useState(false);
  const [auctionData, setAuctionData] = useState<any>(null);
  const [scraping, setScraping] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveResults, setArchiveResults] = useState<any>(null);

  // Scrape progress
  const [scrapeProgress, setScrapeProgress] = useState({
    isActive: false,
    currentSource: '',
    completedSources: 0,
    totalSources: 50,
  });

  // Diagnostics data
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [sourceStats, setSourceStats] = useState<any[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [recentAuctions, setRecentAuctions] = useState<any[]>([]);
  const [upcomingAuctions, setUpcomingAuctions] = useState<any[]>([]);

  // Schedule settings
  const [scheduleSettings, setScheduleSettings] = useState({
    enabled: false,
    cadence: 'daily',
    scheduleTime: '00:00',
    lastRun: null as string | null,
  });

  // CSR2 Rates
  const [csr2Rates, setCsr2Rates] = useState<any[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [rateSearchFilter, setRateSearchFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');

  // Blocklist
  const [blocklist, setBlocklist] = useState<any[]>([]);
  const [loadingBlocklist, setLoadingBlocklist] = useState(false);
  const [blocklistSearch, setBlocklistSearch] = useState('');

  // Auction viewer
  const [viewingAuctions, setViewingAuctions] = useState<{ source: string; category: string; auctions: any[] } | null>(null);
  const [auctionPage, setAuctionPage] = useState(1);
  const auctionsPerPage = 10;

  // Iowa-only filter - persisted to localStorage
  const [showIowaOnly, setShowIowaOnly] = useState<boolean>(() => {
    const saved = localStorage.getItem('farmscope-iowa-only-filter');
    return saved === 'true';
  });

  // Handler for toggling Iowa filter
  const toggleIowaFilter = () => {
    const newValue = !showIowaOnly;
    setShowIowaOnly(newValue);
    localStorage.setItem('farmscope-iowa-only-filter', String(newValue));
    // Dispatch custom event so EnhancedMap can react to the change
    window.dispatchEvent(new CustomEvent('farmscope-iowa-filter-changed'));
  };

  // Load initial data
  useEffect(() => {
    checkAuctions();
    loadDiagnostics();
    loadSourceStats();
    loadCountyCsr2Rates();
    fetchBlocklist();
    loadScheduleSettings();
  }, []);

  // API Functions
  const checkAuctions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auctions/all');
      const data = await response.json();
      setAuctionData(data);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
    }
    setLoading(false);
  };

  const loadDiagnostics = async () => {
    try {
      const [diagnostics, recent, upcoming] = await Promise.all([
        fetch('/api/auctions/diagnostics').then(r => r.json()),
        fetch('/api/auctions/diagnostics/recent-acquisitions?limit=10').then(r => r.json()),
        fetch('/api/auctions/diagnostics/upcoming?limit=15').then(r => r.json()),
      ]);

      if (diagnostics.success) {
        setDiagnosticsData(diagnostics);
      }
      setRecentAuctions(recent.auctions || []);
      setUpcomingAuctions(upcoming.auctions || []);
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
    }
  };

  const loadSourceStats = async () => {
    try {
      const response = await fetch('/api/auctions/source-stats');
      const data = await response.json();
      if (data.success) {
        setSourceStats(data.stats || []);
      }
    } catch (error) {
      console.error('Failed to load source stats:', error);
    }
  };

  const loadScheduleSettings = async () => {
    try {
      const response = await fetch('/api/auctions/schedule');
      const data = await response.json();
      if (data.success) {
        setScheduleSettings({
          enabled: data.enabled,
          cadence: data.cadence || 'daily',
          scheduleTime: data.scheduleTime || '00:00',
          lastRun: data.lastRun,
        });
      }
    } catch (error) {
      console.error('Failed to load schedule:', error);
    }
  };

  const updateScheduleSettings = async (updates: Partial<typeof scheduleSettings>) => {
    const newSettings = { ...scheduleSettings, ...updates };
    setScheduleSettings(newSettings);

    try {
      await fetch('/api/auctions/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  };

  const startScrape = async () => {
    setScraping(true);
    setScrapeProgress({ isActive: true, currentSource: 'Initializing...', completedSources: 0, totalSources: 50 });

    try {
      await fetch('/api/auctions/refresh', { method: 'POST' });

      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch('/api/auctions/scrape-progress');
          const progress = await progressResponse.json();

          if (progress.success && progress.isActive) {
            setScrapeProgress({
              isActive: true,
              currentSource: progress.currentSource,
              completedSources: progress.completedSources,
              totalSources: progress.totalSources,
            });
          } else {
            clearInterval(pollInterval);
            setScrapeProgress({ isActive: false, currentSource: 'Complete!', completedSources: 50, totalSources: 50 });
            setScraping(false);
            checkAuctions();
            loadDiagnostics();
            loadSourceStats();
          }
        } catch (error) {
          console.error('Progress poll failed:', error);
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(pollInterval);
        setScraping(false);
        setScrapeProgress((prev) => ({ ...prev, isActive: false }));
      }, 600000);
    } catch (error) {
      console.error('Scrape failed:', error);
      setScraping(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const response = await fetch('/api/auctions/archive-old', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setArchiveResults(data);
        checkAuctions();
      }
    } catch (error) {
      console.error('Archive failed:', error);
    }
    setArchiving(false);
  };

  // CSR2 Rates Functions
  const loadCountyCsr2Rates = async () => {
    setLoadingRates(true);
    try {
      const response = await fetch('/api/admin/csr2-rates');
      const data = await response.json();
      if (data.success) {
        setCsr2Rates(data.rates || []);
      }
    } catch (error) {
      console.error('Failed to load CSR2 rates:', error);
    }
    setLoadingRates(false);
  };

  const updateCsr2Rate = async (county: string) => {
    try {
      const response = await fetch(`/api/admin/csr2-rates/${county}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csr2Price: editValue, notes: editNotes || undefined }),
      });
      const data = await response.json();
      if (data.success) {
        loadCountyCsr2Rates();
        setEditingRate(null);
      }
    } catch (error) {
      console.error('Failed to update rate:', error);
    }
  };

  // Blocklist Functions
  const fetchBlocklist = async () => {
    setLoadingBlocklist(true);
    try {
      const response = await fetch('/api/auctions/blocklist/all');
      const data = await response.json();
      if (data.success) {
        setBlocklist(data.blocklist || []);
      }
    } catch (error) {
      console.error('Failed to fetch blocklist:', error);
    }
    setLoadingBlocklist(false);
  };

  const addToBlocklist = async (url: string) => {
    try {
      const response = await fetch('/api/auctions/blocklist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, reason: 'non-farm' }),
      });
      const data = await response.json();
      if (data.success) {
        fetchBlocklist();
        checkAuctions();
      }
    } catch (error) {
      console.error('Failed to add to blocklist:', error);
    }
  };

  const removeFromBlocklist = async (id: number) => {
    try {
      const response = await fetch(`/api/auctions/blocklist/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        fetchBlocklist();
      }
    } catch (error) {
      console.error('Failed to remove from blocklist:', error);
    }
  };

  // View auctions for source/category
  const handleViewAuctions = (source: string, category: string) => {
    if (!auctionData?.auctions) return;

    const filtered = auctionData.auctions.filter((auction: any) => {
      if (auction.sourceWebsite !== source) return false;

      const auctionDate = auction.auctionDate ? new Date(auction.auctionDate) : null;

      switch (category) {
        case 'active':
          return auction.status === 'active';
        case 'upcoming':
          return auctionDate && auctionDate >= new Date() && auction.status === 'active';
        case 'needs_review':
          return auction.needsDateReview === true;
        case 'sold':
          return auction.status === 'sold';
        default:
          return false;
      }
    });

    setViewingAuctions({ source, category, auctions: filtered });
    setAuctionPage(1);
  };

  // Filtered rates
  const filteredRates = useMemo(() => {
    return csr2Rates.filter((rate) => {
      const matchesSearch = !rateSearchFilter || rate.county.toLowerCase().includes(rateSearchFilter.toLowerCase());
      const matchesRegion = regionFilter === 'all' || rate.region === regionFilter;
      return matchesSearch && matchesRegion;
    });
  }, [csr2Rates, rateSearchFilter, regionFilter]);

  const uniqueRegions = useMemo(() => {
    return Array.from(new Set(csr2Rates.map((r) => r.region))).sort();
  }, [csr2Rates]);

  // Filtered blocklist
  const filteredBlocklist = useMemo(() => {
    if (!blocklistSearch) return blocklist;
    return blocklist.filter(
      (item) =>
        item.url?.toLowerCase().includes(blocklistSearch.toLowerCase()) ||
        item.reason?.toLowerCase().includes(blocklistSearch.toLowerCase())
    );
  }, [blocklist, blocklistSearch]);

  const progressPercent = scrapeProgress.totalSources > 0 ? (scrapeProgress.completedSources / scrapeProgress.totalSources) * 100 : 0;

  return (
    <div className="min-h-screen bg-wheat-cream">
      {/* Contour pattern background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url(/patterns/contour-lines.svg)', backgroundSize: '300px' }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-wheat-cream/95 backdrop-blur-sm border-b border-warm-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-field flex items-center justify-center shadow-terra">
                <BarChart3 className="w-6 h-6 text-wheat-cream" />
              </div>
              <div>
                <h1 className="font-display text-2xl text-terra-black">Auction Dashboard</h1>
                <p className="text-sm text-warm-500">System Diagnostics & Data Management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Iowa-only toggle */}
              <button
                onClick={toggleIowaFilter}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-medium',
                  showIowaOnly
                    ? 'bg-field text-wheat-cream border-field shadow-terra'
                    : 'bg-white text-warm-600 border-warm-300 hover:border-warm-400 hover:bg-warm-50'
                )}
              >
                <Map className="w-4 h-4" />
                <span>Iowa Only</span>
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
                    showIowaOnly
                      ? 'bg-wheat-cream border-wheat-cream'
                      : 'bg-transparent border-warm-400'
                  )}
                >
                  {showIowaOnly && (
                    <CheckCircle className="w-3 h-3 text-field" />
                  )}
                </div>
              </button>

              <Button
                onClick={() => (window.location.href = '/')}
                variant="outline"
                className="btn-terra-outline"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Map
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Scrape Progress Indicator */}
      <AnimatePresence>
        {scrapeProgress.isActive && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-6 z-50 bg-white rounded-xl border border-warm-200 shadow-terra-lg p-4 w-72"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-gold animate-spin" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-terra-black text-sm">Scraping Data</p>
                <p className="text-xs text-warm-500 truncate">{scrapeProgress.currentSource}</p>
              </div>
            </div>
            <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-field to-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-xs text-warm-500 mt-2 text-center font-mono">
              {scrapeProgress.completedSources} / {scrapeProgress.totalSources} sources ({Math.round(progressPercent)}%)
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative">
        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            icon={Database}
            label="Total Auctions"
            value={auctionData?.total || 0}
            variant="default"
          />
          <MetricCard
            icon={MapPin}
            label="With Coordinates"
            value={auctionData?.withCoordinates || 0}
            subValue={`${auctionData?.total ? Math.round((auctionData.withCoordinates / auctionData.total) * 100) : 0}% mapped`}
            variant="success"
          />
          <MetricCard
            icon={Layers}
            label="Active Sources"
            value={Object.keys(auctionData?.bySource || {}).length}
            variant="field"
          />
          <MetricCard
            icon={AlertCircle}
            label="Need Coordinates"
            value={auctionData?.withoutCoordinates || 0}
            variant="warning"
          />
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Scraper Control */}
          <div className="card-terra-elevated p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center">
                <Zap className="w-5 h-5 text-terra-black" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Data Collection</h3>
                <p className="text-xs text-warm-500">50 auction sources across Iowa</p>
              </div>
            </div>

            <p className="text-sm text-warm-600 mb-4">
              Last run:{' '}
              <span className="font-semibold">
                {diagnosticsData?.lastScrapeTime ? getRelativeTime(diagnosticsData.lastScrapeTime) : 'Never'}
              </span>
            </p>

            <Button onClick={startScrape} disabled={scraping} className="w-full btn-terra mb-3">
              {scraping ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scraping...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Run Full Scraper
                </span>
              )}
            </Button>

            <Button onClick={handleArchive} disabled={archiving} variant="outline" className="w-full btn-terra-ghost">
              {archiving ? (
                <span className="flex items-center gap-2">
                  <Archive className="w-4 h-4 animate-pulse" />
                  Archiving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Archive Old Auctions
                </span>
              )}
            </Button>

            {archiveResults && (
              <div className="mt-3 p-3 bg-field/10 rounded-lg border border-field/20">
                <p className="text-sm text-field">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Archived {archiveResults.archived} auctions
                </p>
              </div>
            )}

            {/* Schedule Settings */}
            <div className="mt-4 pt-4 border-t border-warm-200">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-warm-500" />
                <span className="text-sm font-medium text-terra-black">Auto-Scrape Schedule</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id="auto-enabled"
                  checked={scheduleSettings.enabled}
                  onCheckedChange={(checked) => updateScheduleSettings({ enabled: !!checked })}
                />
                <Label htmlFor="auto-enabled" className="text-sm cursor-pointer">
                  Enable automatic scraping
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={scheduleSettings.cadence}
                  onValueChange={(value) => updateScheduleSettings({ cadence: value })}
                  disabled={!scheduleSettings.enabled}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="every-other-day">Every 2 Days</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  value={scheduleSettings.scheduleTime}
                  onChange={(e) => updateScheduleSettings({ scheduleTime: e.target.value })}
                  disabled={!scheduleSettings.enabled}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card-terra-elevated p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-field/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-field" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Last Scrape Summary</h3>
                <p className="text-xs text-warm-500">Most recent collection results</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-warm-50 rounded-lg border border-warm-200">
                <p className="font-mono text-xl font-bold text-terra-black">
                  {diagnosticsData?.summary?.totalDiscovered || auctionData?.total || 0}
                </p>
                <p className="text-xs text-warm-500">URLs Found</p>
              </div>
              <div className="p-3 bg-field/5 rounded-lg border border-field/20">
                <p className="font-mono text-xl font-bold text-field">
                  {diagnosticsData?.summary?.totalSaved || auctionData?.total || 0}
                </p>
                <p className="text-xs text-warm-500">Saved to DB</p>
              </div>
              <div className="p-3 bg-gold/10 rounded-lg border border-gold/20">
                <p className="font-mono text-xl font-bold text-gold-dark">
                  {diagnosticsData?.summary?.iowaDiscovered ||
                    auctionData?.auctions?.filter((a: any) => a.state?.toLowerCase() === 'iowa').length ||
                    0}
                </p>
                <p className="text-xs text-warm-500">Iowa Auctions</p>
              </div>
              <div className="p-3 bg-warm-50 rounded-lg border border-warm-200">
                <p className="font-mono text-xl font-bold text-warm-600">{sourceStats.length}</p>
                <p className="text-xs text-warm-500">Sources Active</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Acquisitions & Upcoming Auctions - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Recently Acquired */}
          <div className="card-terra-elevated overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-field/10 to-field/5 border-b border-field/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-field flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-wheat-cream" />
                </div>
                <div>
                  <h3 className="font-semibold text-terra-black">Recently Acquired</h3>
                  <p className="text-xs text-warm-500">Latest 10 scraped auctions</p>
                </div>
              </div>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
              {recentAuctions.length > 0 ? (
                recentAuctions.map((auction, i) => (
                  <div
                    key={auction.id || i}
                    className="p-3 bg-white rounded-lg border border-warm-200 hover:border-field/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-terra-black text-sm truncate">{auction.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-warm-500">
                          <span className="px-1.5 py-0.5 bg-warm-100 rounded text-warm-600 text-xs">
                            {auction.sourceWebsite?.replace('https://', '').replace('www.', '').split('/')[0] || 'Unknown'}
                          </span>
                          {auction.county && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {auction.county}{auction.state ? `, ${auction.state}` : ''}
                            </span>
                          )}
                          {auction.acres && (
                            <span className="flex items-center gap-1">
                              <Ruler className="w-3 h-3" />
                              {auction.acres} ac
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {auction.latitude && auction.longitude && (
                          <a
                            href={`/?lat=${auction.latitude}&lng=${auction.longitude}&zoom=14`}
                            className="p-1.5 rounded-lg hover:bg-field/10 text-warm-400 hover:text-field transition-colors"
                            title="View on map"
                          >
                            <Map className="w-4 h-4" />
                          </a>
                        )}
                        {auction.url && (
                          <a
                            href={auction.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-terra-black transition-colors"
                            title="View listing"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-warm-500 py-8 text-sm">No recent auctions found</p>
              )}
            </div>
          </div>

          {/* Upcoming Auctions */}
          <div className="card-terra-elevated overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-gold/15 to-gold/5 border-b border-gold/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-terra-black" />
                </div>
                <div>
                  <h3 className="font-semibold text-terra-black">Upcoming Auctions</h3>
                  <p className="text-xs text-warm-500">Next 15 auction dates</p>
                </div>
              </div>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
              {upcomingAuctions.length > 0 ? (
                upcomingAuctions.map((auction, i) => {
                  const daysUntil = auction.auctionDate ? getDaysUntil(auction.auctionDate) : null;
                  const urgencyClass = daysUntil !== null
                    ? daysUntil <= 2
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : daysUntil <= 7
                      ? 'bg-gold/20 text-gold-dark border-gold/30'
                      : 'bg-field/10 text-field border-field/20'
                    : 'bg-warm-100 text-warm-600 border-warm-200';

                  return (
                    <div
                      key={auction.id || i}
                      className="p-3 bg-white rounded-lg border border-warm-200 hover:border-gold/40 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-terra-black text-sm truncate">{auction.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-warm-500">
                            {auction.auctionDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(auction.auctionDate).toLocaleDateString()}
                              </span>
                            )}
                            {daysUntil !== null && (
                              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', urgencyClass)}>
                                {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                              </span>
                            )}
                            {auction.county && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {auction.county}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {auction.latitude && auction.longitude && (
                            <a
                              href={`/?lat=${auction.latitude}&lng=${auction.longitude}&zoom=14`}
                              className="p-1.5 rounded-lg hover:bg-gold/10 text-warm-400 hover:text-gold-dark transition-colors"
                              title="View on map"
                            >
                              <Map className="w-4 h-4" />
                            </a>
                          )}
                          {auction.url && (
                            <a
                              href={auction.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-warm-100 text-warm-400 hover:text-terra-black transition-colors"
                              title="View listing"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-warm-500 py-8 text-sm">No upcoming auctions found</p>
              )}
            </div>
          </div>
        </div>

        {/* Source Statistics */}
        <CollapsibleSection title="Source Statistics" icon={Layers} defaultOpen badge={sourceStats.length}>
          <div className="space-y-2 mt-4 max-h-[500px] overflow-y-auto pr-2">
            {sourceStats.map((stat) => (
              <SourceStatRow
                key={stat.source_website}
                source={stat.source_website}
                stats={stat}
                isExpanded={expandedSource === stat.source_website}
                onToggle={() => setExpandedSource(expandedSource === stat.source_website ? null : stat.source_website)}
                onViewAuctions={handleViewAuctions}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* Auction Viewer Modal */}
        <AnimatePresence>
          {viewingAuctions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-terra-black/40 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setViewingAuctions(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-wheat-cream rounded-xl shadow-terra-lg w-full max-w-3xl max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-warm-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-terra-black">{viewingAuctions.source}</h3>
                    <p className="text-sm text-warm-500 capitalize">
                      {viewingAuctions.category.replace('_', ' ')} ({viewingAuctions.auctions.length})
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingAuctions(null)}
                    className="p-2 rounded-lg hover:bg-warm-100 text-warm-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                  {viewingAuctions.auctions
                    .slice((auctionPage - 1) * auctionsPerPage, auctionPage * auctionsPerPage)
                    .map((auction: any, i: number) => (
                      <AuctionRow key={i} auction={auction} onBlock={addToBlocklist} />
                    ))}
                  {viewingAuctions.auctions.length === 0 && (
                    <p className="text-center text-warm-500 py-8">No auctions in this category</p>
                  )}
                </div>
                {viewingAuctions.auctions.length > auctionsPerPage && (
                  <div className="p-4 border-t border-warm-200 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAuctionPage(Math.max(1, auctionPage - 1))}
                      disabled={auctionPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-warm-500">
                      Page {auctionPage} of {Math.ceil(viewingAuctions.auctions.length / auctionsPerPage)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAuctionPage(Math.min(Math.ceil(viewingAuctions.auctions.length / auctionsPerPage), auctionPage + 1))
                      }
                      disabled={auctionPage >= Math.ceil(viewingAuctions.auctions.length / auctionsPerPage)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CSR2 Rates Section */}
        <div className="mt-6">
          <CollapsibleSection title="County CSR2 Rates" icon={DollarSign} badge={`${csr2Rates.length} counties`}>
            <div className="mt-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
                  <Input
                    placeholder="Search counties..."
                    value={rateSearchFilter}
                    onChange={(e) => setRateSearchFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Region" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">All Regions</SelectItem>
                    {uniqueRegions.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-2">
                {filteredRates.map((rate) => (
                  <div
                    key={rate.county}
                    className={cn(
                      'p-3 rounded-xl border transition-all',
                      rate.csr2Price >= 171
                        ? 'bg-field/5 border-field/20'
                        : rate.csr2Price >= 151
                        ? 'bg-warm-50 border-warm-200'
                        : 'bg-gold/5 border-gold/20'
                    )}
                  >
                    {editingRate === rate.county ? (
                      <div className="space-y-2">
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(Number(e.target.value))}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Notes"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => updateCsr2Rate(rate.county)} className="flex-1 h-7 text-xs">
                            <Save className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingRate(null)} className="h-7 text-xs">
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-terra-black text-sm">{rate.county}</p>
                          <p className="text-xs text-warm-500">{rate.region}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-lg font-bold text-terra-black">${rate.csr2Price}</span>
                          <button
                            onClick={() => {
                              setEditingRate(rate.county);
                              setEditValue(rate.csr2Price);
                              setEditNotes(rate.notes || '');
                            }}
                            className="p-1 rounded hover:bg-warm-100 text-warm-400 hover:text-terra-black"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Blocklist Section */}
        <div className="mt-6">
          <CollapsibleSection title="Auction Blocklist" icon={X} badge={blocklist.length}>
            <div className="mt-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
                <Input
                  placeholder="Search blocklist..."
                  value={blocklistSearch}
                  onChange={(e) => setBlocklistSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {filteredBlocklist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-warm-200"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-terra-black truncate">{item.url}</p>
                      <p className="text-xs text-warm-500">
                        {item.reason} • Added {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromBlocklist(item.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-warm-400 hover:text-red-600 transition-colors ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {filteredBlocklist.length === 0 && (
                  <p className="text-center text-warm-500 py-4 text-sm">No blocked URLs</p>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </main>
    </div>
  );
}
