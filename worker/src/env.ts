export type Env = {
  DATABASE_URL: string;
  DATABASE_URL_SOIL?: string;
  OPENAI_API_KEY: string;
  FIRECRAWL_API_KEY?: string;
  AGRICULTURAL_ASSISTANT_ID?: string;
  IOWA_MARKET_ASSISTANT_ID?: string;
  VECTOR_STORE_ID?: string;
  IOWA_VECTOR_STORE_ID?: string;

  // Scrape pipeline queues. See worker/src/queues.ts for the topology.
  SCRAPE_SOURCES: Queue<import('./queues').SourceMessage>;
  SCRAPE_DETAILS: Queue<import('./queues').DetailMessage>;
  ENRICH: Queue<import('./queues').EnrichMessage>;
};
