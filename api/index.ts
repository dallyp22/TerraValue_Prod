import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";

// Create app at module level
const app = express();

// Security middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Track if initialization is complete
let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function initializeApp() {
  // If already initialized, return immediately
  if (isInitialized) {
    return;
  }
  
  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }
  
  // Start initialization
  initPromise = (async () => {
    try {
      console.log('🔧 Initializing routes...');
      await registerRoutes(app);
      
      // NOTE: Static file serving is handled by Vercel automatically
      // Do NOT call serveStatic(app) in serverless environment
      
      // Error handler MUST be registered AFTER all routes
      app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        
        console.error(`[ERROR] ${req.method} ${req.path} - ${status}: ${message}`);
        if (err.stack) {
          console.error('Stack trace:', err.stack);
        }
        
        res.status(status).json({ 
          success: false,
          message: status >= 500 ? "Internal Server Error" : message,
          ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack })
        });
      });
      
      isInitialized = true;
      console.log('✅ Routes registered successfully');
    } catch (error) {
      console.error('❌ Failed to register routes:', error);
      initPromise = null; // Reset so we can retry
      throw error;
    }
  })();
  
  return initPromise;
}

// Export for Vercel serverless
export default async function handler(req: any, res: any) {
  try {
    // Set content type to JSON by default for API routes
    if (req.url && req.url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
    }
    
    // Initialize app on first request
    await initializeApp();
    
    // Pass request to Express app
    return app(req, res);
  } catch (error) {
    console.error('❌ Handler initialization error:', error);
    
    // Ensure we always return JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Return error details
    return res.status(500).json({
      success: false,
      message: 'Server initialization failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

