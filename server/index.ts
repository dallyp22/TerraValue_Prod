import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { cleanupOpenAI } from "./services/openai";
import { AuctionArchiverService } from "./services/auctionArchiver";
import { automaticScraperService } from "./services/automaticScraper";

const app = express();

// CORS middleware - allow Vercel frontend to access Railway backend
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://terra-value-prod.vercel.app',
    'http://localhost:5001',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Changed from DENY to allow embedding
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Enhanced error logging
    console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.error(`Status: ${status}, Message: ${message}`);
    if (err.stack) {
      console.error(`Stack: ${err.stack}`);
    }

    res.status(status).json({ 
      success: false,
      message: status >= 500 ? "Internal Server Error" : message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  // Only start server if not in serverless environment
  if (!server) {
    console.log('Running in serverless mode - skipping server startup');
    return;
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on port 5001 (5000 is used by AirPlay on macOS)
  // this serves both the API and the client.
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5001;
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  // Start auction archiver service (runs daily to clean up past auctions)
  const archiverService = new AuctionArchiverService();
  archiverService.start();

  // Start automatic scraper service (runs on schedule if enabled)
  automaticScraperService.start();

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, cleaning up...');
    automaticScraperService.stop();
    archiverService.stop();
    await cleanupOpenAI();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, cleaning up...');
    automaticScraperService.stop();
    archiverService.stop();
    await cleanupOpenAI();
    process.exit(0);
  });
})();
