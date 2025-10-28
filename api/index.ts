import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { serveStatic } from "../server/vite";

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

// Initialize routes
let routesRegistered = false;
async function initializeApp() {
  if (!routesRegistered) {
    try {
      await registerRoutes(app);
      routesRegistered = true;
      console.log('✅ Routes registered successfully');
    } catch (error) {
      console.error('❌ Failed to register routes:', error);
      throw error;
    }
  }
}

// Error handler
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

// Serve static files in production
serveStatic(app);

// Export for Vercel serverless
export default async function handler(req: any, res: any) {
  try {
    // Set content type to JSON by default for API routes
    if (req.url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
    }
    
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error('Handler initialization error:', error);
    // Ensure we always return JSON
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      message: 'Server initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

