import type { IncomingMessage, ServerResponse } from 'http';

// Proxy handler for Vercel Serverless Function execution
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Dynamically import server instance
  const { app } = await import('../server.ts');
  return app(req as any, res as any);
}
