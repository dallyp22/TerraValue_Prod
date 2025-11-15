-- Migration: Add AI Enrichment Fields to Auctions Table
-- Created: 2025-01-15
-- Description: Adds comprehensive AI-enriched fields for auction data standardization

-- Add AI Enriched standardized fields
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_title TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_description TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_auction_house TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_auction_date TIMESTAMP;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_auction_location TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_property_location TEXT;

-- Add Legal description parsing fields
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS legal_description TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS legal_description_parsed JSONB;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS legal_description_source TEXT;

-- Add Comprehensive property details
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS soil_mentions TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS crop_history TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS improvements JSONB;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS utilities JSONB;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS road_access TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS drainage TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS tillable_percent REAL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS crp_details TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS water_rights TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS mineral_rights TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS zoning_info TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS tax_info TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS seller_motivation TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS financing_options TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS possession TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS key_highlights JSONB;

-- Add Geocoding enhancements
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS geocoding_method TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS geocoding_confidence REAL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS geocoding_source TEXT;

-- Add AI enrichment tracking fields
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enrichment_version TEXT DEFAULT 'v1';
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS enrichment_error TEXT;

-- Create index on enrichment status for efficient querying
CREATE INDEX IF NOT EXISTS idx_auctions_enrichment_status ON auctions(enrichment_status);

-- Create index on geocoding confidence for quality analysis
CREATE INDEX IF NOT EXISTS idx_auctions_geocoding_confidence ON auctions(geocoding_confidence);

-- Update existing auctions to have pending enrichment status
UPDATE auctions SET enrichment_status = 'pending' WHERE enrichment_status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN auctions.enrichment_status IS 'Status of AI enrichment: pending, processing, completed, failed';
COMMENT ON COLUMN auctions.geocoding_confidence IS 'Confidence score 0-100: 100=address, 80=legal desc, 50=county centroid';
COMMENT ON COLUMN auctions.enriched_auction_location IS 'Physical location where the auction is held';
COMMENT ON COLUMN auctions.enriched_property_location IS 'Physical location of the land/property being auctioned';

