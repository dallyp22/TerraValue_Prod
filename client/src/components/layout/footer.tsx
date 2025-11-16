import { ChartLine } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-100 mt-16 sm:mt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-16">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-slate-900 p-3 rounded-2xl">
                <ChartLine className="text-white h-5 w-5" />
              </div>
              <span className="font-light text-slate-900 text-xl tracking-wide">FarmScope AI</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed max-w-sm font-light">
              AI-powered agricultural land valuation for informed investment decisions using authentic market data.
            </p>
          </div>
          
          <div>
            <h3 className="font-medium text-slate-900 mb-6 text-sm tracking-wide uppercase">Resources</h3>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">API Documentation</a></li>
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">Market Reports</a></li>
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">Support</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium text-slate-900 mb-6 text-sm tracking-wide uppercase">Company</h3>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">About</a></li>
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-slate-900 transition-colors duration-200 font-light">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-slate-100 mt-8 sm:mt-12 pt-8 sm:pt-10 text-center">
          <p className="text-xs sm:text-sm text-slate-400 font-light">
            © 2025 LandIQ. All rights reserved. Powered by OpenAI GPT-4o and Vector Store Technology.
          </p>
        </div>
      </div>
    </footer>
  );
}
