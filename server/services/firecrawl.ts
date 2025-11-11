import axios from 'axios';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v2';

interface FirecrawlExtractOptions {
  urls: string[];
  prompt: string;
  schema: any;
  allowExternalLinks?: boolean;
}

export class FirecrawlService {
  // Extract structured data from URLs using LLM
  async extract(options: FirecrawlExtractOptions) {
    try {
      const response = await axios.post(`${FIRECRAWL_BASE_URL}/extract`, {
        urls: options.urls,
        prompt: options.prompt,
        schema: options.schema,
        allowExternalLinks: options.allowExternalLinks || false,
        enableWebSearch: false,
        includeSubdomains: false
      }, {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 120 second timeout for extraction
      });
      return response.data;
    } catch (error: any) {
      // Log the full error for debugging
      if (error.response) {
        console.error('Extract API Error:', {
          status: error.response.status,
          data: error.response.data,
          message: error.message
        });
      }
      throw error;
    }
  }

  // Map website to discover URLs
  async map(url: string, search?: string) {
    const response = await axios.post(`${FIRECRAWL_BASE_URL}/map`, {
      url,
      search,
      limit: 100,
      includeSubdomains: false
    }, {
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    return response.data;
  }

  // Search for auction listings
  async search(query: string, limit = 10) {
    const response = await axios.post(`${FIRECRAWL_BASE_URL}/search`, {
      query,
      limit,
      sources: [{ type: "web" }],
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    }, {
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    return response.data;
  }

  // Scrape single URL
  async scrape(url: string) {
    const response = await axios.post(`${FIRECRAWL_BASE_URL}/scrape`, {
      url,
      formats: ["markdown", "html"],
      onlyMainContent: true
    }, {
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    return response.data;
  }

  // Scrape single URL with JSON extraction
  async scrapeWithJson(url: string) {
    try {
      const response = await axios.post(`${FIRECRAWL_BASE_URL}/scrape`, {
        url,
        formats: [
          {
            type: "json",
            prompt: "Extract land auction details. Be VERY thorough in finding the auction date - look for: 'Auction Date:', 'Sale Date:', 'Start Date:', 'Bidding Ends:', 'Bids Due:', dates in description or title, event dates or deadlines, any temporal information. Return the auction date in MM/DD/YYYY or Month DD, YYYY format. Also extract: title, description, address/location, acreage/acres, land type, county, state.",
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                // Multiple date fields to catch variations
                auction_date: { type: "string", description: "Main auction date" },
                sale_date: { type: "string", description: "Sale or auction date" },
                start_date: { type: "string", description: "Start date or opening date" },
                bid_deadline: { type: "string", description: "Bid deadline or closing date" },
                event_date: { type: "string", description: "Event or auction date" },
                date: { type: "string", description: "Any date found" },
                // Location fields
                address: { type: "string" },
                location: { type: "string" },
                // Property details
                acreage: { type: "number" },
                acres: { type: "number" },
                land_type: { type: "string" },
                property_type: { type: "string" },
                county: { type: "string" },
                state: { type: "string" }
              }
            }
          }
        ],
        onlyMainContent: true
      }, {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      // Return the extracted JSON data
      return response.data?.data?.json || response.data?.json || null;
    } catch (error: any) {
      if (error.response) {
        const shortUrl = typeof url === 'string' ? (url.length > 50 ? url.substring(0, 50) : url) : String(url);
        console.error('Scrape JSON Error:', {
          url: shortUrl,
          status: error.response.status,
          message: error.message
        });
      }
      return null;
    }
  }

  // Scrape page and get all links
  async scrapeWithLinks(url: string) {
    try {
      const response = await axios.post(`${FIRECRAWL_BASE_URL}/scrape`, {
        url,
        formats: ["links", "markdown"],
        onlyMainContent: false // Get all links, not just main content
      }, {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      return {
        links: response.data?.data?.links || response.data?.links || [],
        markdown: response.data?.data?.markdown || response.data?.markdown || ''
      };
    } catch (error: any) {
      console.error('Scrape Links Error:', error.message);
      return { links: [], markdown: '' };
    }
  }

  // Scrape listing page to extract individual property URLs
  async scrapeListingUrls(url: string) {
    try {
      const response = await axios.post(`${FIRECRAWL_BASE_URL}/scrape`, {
        url,
        formats: [
          {
            type: "json",
            prompt: "Extract all individual land/property listing URLs from this page. Look for links to individual property details pages. Return an array of complete URLs.",
            schema: {
              type: "object",
              properties: {
                listing_urls: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["listing_urls"]
            }
          }
        ],
        onlyMainContent: false
      }, {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000 // Longer timeout for listing pages
      });
      
      return response.data?.data?.json || response.data?.json || { listing_urls: [] };
    } catch (error: any) {
      console.error('Scrape Listing URLs Error:', error.message);
      return { listing_urls: [] };
    }
  }
}

export const firecrawlService = new FirecrawlService();

