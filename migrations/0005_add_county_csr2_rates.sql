-- Migration: Add County CSR2 Rates Table
-- Description: Create table for county-specific CSR2 pricing and populate with Iowa counties
-- Date: November 27, 2025

-- Create table
CREATE TABLE IF NOT EXISTS county_csr2_rates (
  id SERIAL PRIMARY KEY,
  county TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  csr2_price INTEGER NOT NULL,
  effective_date TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS county_csr2_rates_county_idx ON county_csr2_rates(county);
CREATE INDEX IF NOT EXISTS county_csr2_rates_region_idx ON county_csr2_rates(region);

-- Insert all 99 Iowa counties with October 2025 rates
INSERT INTO county_csr2_rates (county, region, csr2_price) VALUES
-- Southwest Region ($162/point)
('Adair', 'Southwest', 162),
('Adams', 'Southwest', 162),
('Cass', 'Southwest', 162),
('Fremont', 'Southwest', 162),
('Mills', 'Southwest', 162),
('Montgomery', 'Southwest', 162),
('Page', 'Southwest', 162),
('Pottawattamie', 'Southwest', 162),
('Taylor', 'Southwest', 162),
('Page', 'Southwest', 162),

-- Northeast Region ($183/point)
('Allamakee', 'Northeast', 183),
('Black Hawk', 'Northeast', 183),
('Bremer', 'Northeast', 183),
('Buchanan', 'Northeast', 183),
('Chickasaw', 'Northeast', 183),
('Clayton', 'Northeast', 183),
('Delaware', 'Northeast', 183),
('Dubuque', 'Northeast', 183),
('Fayette', 'Northeast', 183),
('Howard', 'Northeast', 183),
('Winneshiek', 'Northeast', 183),

-- South Central Region ($159/point)
('Appanoose', 'South Central', 159),
('Clarke', 'South Central', 159),
('Davis', 'South Central', 159),
('Decatur', 'South Central', 159),
('Lucas', 'South Central', 159),
('Madison', 'South Central', 159),
('Mahaska', 'South Central', 159),
('Marion', 'South Central', 159),
('Monroe', 'South Central', 159),
('Ringgold', 'South Central', 159),
('Union', 'South Central', 159),
('Wapello', 'South Central', 159),
('Warren', 'South Central', 159),
('Wayne', 'South Central', 159),

-- West Central Region ($166/point)
('Audubon', 'West Central', 166),
('Calhoun', 'West Central', 166),
('Carroll', 'West Central', 166),
('Crawford', 'West Central', 166),
('Greene', 'West Central', 166),
('Guthrie', 'West Central', 166),
('Harrison', 'West Central', 166),
('Ida', 'West Central', 166),
('Monona', 'West Central', 166),
('Sac', 'West Central', 166),
('Shelby', 'West Central', 166),
('Woodbury', 'West Central', 166),

-- East Central Region ($168/point)
('Benton', 'East Central', 168),
('Cedar', 'East Central', 168),
('Clinton', 'East Central', 168),
('Iowa', 'East Central', 168),
('Jackson', 'East Central', 168),
('Johnson', 'East Central', 168),
('Jones', 'East Central', 168),
('Linn', 'East Central', 168),
('Muscatine', 'East Central', 168),
('Scott', 'East Central', 168),

-- Central Region ($146/point)
('Boone', 'Central', 146),
('Dallas', 'Central', 146),
('Jasper', 'Central', 146),
('Marshall', 'Central', 146),
('Polk', 'Central', 146),
('Poweshiek', 'Central', 146),
('Story', 'Central', 146),
('Tama', 'Central', 146),

-- North Central Region ($128/point)
('Butler', 'North Central', 128),
('Cerro Gordo', 'North Central', 128),
('Floyd', 'North Central', 128),
('Franklin', 'North Central', 128),
('Grundy', 'North Central', 128),
('Hamilton', 'North Central', 128),
('Hancock', 'North Central', 128),
('Hardin', 'North Central', 128),
('Humboldt', 'North Central', 128),
('Kossuth', 'North Central', 128),
('Mitchell', 'North Central', 128),
('Webster', 'North Central', 128),
('Winnebago', 'North Central', 128),
('Worth', 'North Central', 128),
('Wright', 'North Central', 128),

-- Northwest Region ($187/point)
('Buena Vista', 'Northwest', 187),
('Cherokee', 'Northwest', 187),
('Clay', 'Northwest', 187),
('Dickinson', 'Northwest', 187),
('Emmet', 'Northwest', 187),
('Lyon', 'Northwest', 187),
('O''Brien', 'Northwest', 187),
('Osceola', 'Northwest', 187),
('Palo Alto', 'Northwest', 187),
('Plymouth', 'Northwest', 187),
('Pocahontas', 'Northwest', 187),
('Sioux', 'Northwest', 187),

-- Southeast Region ($155/point)
('Des Moines', 'Southeast', 155),
('Henry', 'Southeast', 155),
('Jefferson', 'Southeast', 155),
('Keokuk', 'Southeast', 155),
('Lee', 'Southeast', 155),
('Louisa', 'Southeast', 155),
('Van Buren', 'Southeast', 155),
('Washington', 'Southeast', 155)
ON CONFLICT (county) DO NOTHING;

-- Add comment
COMMENT ON TABLE county_csr2_rates IS 'County-specific CSR2 pricing rates for Iowa land valuation';

