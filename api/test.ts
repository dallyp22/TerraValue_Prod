// Simple test endpoint to verify Vercel is working
export default function handler(req: any, res: any) {
  res.status(200).json({ 
    success: true, 
    message: 'Simple test endpoint working',
    timestamp: new Date().toISOString()
  });
}

