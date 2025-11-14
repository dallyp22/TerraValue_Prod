import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

// Levenshtein distance calculation (optimized with early exit)
function levenshteinDistance(str1: string, str2: string, maxDistance: number = 10): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Early exit if length difference is too large
  if (Math.abs(len1 - len2) > maxDistance) return maxDistance + 1;

  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    let minRowValue = Infinity;
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
      minRowValue = Math.min(minRowValue, matrix[i][j]);
    }
    // Early exit if entire row is too far
    if (minRowValue > maxDistance) return maxDistance + 1;
  }

  return matrix[len1][len2];
}

// Enhanced name normalization for comparison
function normalizeForComparison(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s*(AND|&)\s*/g, ' ')
    .replace(/\s*(LLC|L\.?L\.?C\.?|INC\.?|INCORPORATED|TRUST|ESTATE|REVOCABLE|IRREVOCABLE|FAMILY|FARMS?|PROPERTIES|CORP\.?|CORPORATION|LTD\.?|LIMITED|CO\.?)$/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract surname for grouping
function extractSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  // Return last word as surname
  return parts[parts.length - 1] || name;
}

interface OwnerStats {
  normalized_owner: string;
  parcel_count: number;
  total_acres: number;
  sample_original: string;
}

interface NameGroup {
  canonical: string;
  members: Array<{ name: string; parcels: number; acres: number }>;
  totalParcels: number;
  confidence: number;
  matchType: string;
}

async function analyzeOwnerNameVariations(county?: string) {
  console.log('📊 Owner Name Variation Analysis (Optimized)');
  console.log('='.repeat(70));
  console.log();

  const countyLabel = county ? ` (${county} County)` : ' (Statewide)';
  console.log(`Loading owner data${countyLabel}...`);
  
  let owners: OwnerStats[];
  
  if (county) {
    owners = await sql<OwnerStats[]>`
      SELECT 
        deed_holder_normalized as normalized_owner,
        COUNT(*)::int as parcel_count,
        COALESCE(SUM(area_sqm), 0)::numeric / 4046.86 as total_acres,
        MAX(deed_holder) as sample_original
      FROM parcels
      WHERE deed_holder_normalized IS NOT NULL
        AND deed_holder_normalized != ''
        AND county_name = ${county}
      GROUP BY deed_holder_normalized
      ORDER BY COUNT(*) DESC
    `;
  } else {
    owners = await sql<OwnerStats[]>`
      SELECT 
        deed_holder_normalized as normalized_owner,
        COUNT(*)::int as parcel_count,
        COALESCE(SUM(area_sqm), 0)::numeric / 4046.86 as total_acres,
        MAX(deed_holder) as sample_original
      FROM parcels
      WHERE deed_holder_normalized IS NOT NULL
        AND deed_holder_normalized != ''
      GROUP BY deed_holder_normalized
      ORDER BY COUNT(*) DESC
    `;
  }

  console.log(`✅ Found ${owners.length.toLocaleString()} unique owners\n`);
  console.log('🔍 Analyzing potential fuzzy matches (optimized algorithm)...\n');

  // Group owners by surname for faster comparison
  const bySurname = new Map<string, OwnerStats[]>();
  
  for (const owner of owners) {
    const normalized = normalizeForComparison(owner.normalized_owner);
    const surname = extractSurname(normalized);
    
    if (!bySurname.has(surname)) {
      bySurname.set(surname, []);
    }
    bySurname.get(surname)!.push(owner);
  }

  console.log(`📋 Grouped into ${bySurname.size.toLocaleString()} surname clusters`);
  console.log(`   Average cluster size: ${(owners.length / bySurname.size).toFixed(1)} owners\n`);

  const groups: NameGroup[] = [];
  const processed = new Set<string>();
  
  let surnameProgress = 0;
  const totalSurnames = bySurname.size;

  // Process each surname group
  for (const [surname, surnameOwners] of bySurname.entries()) {
    surnameProgress++;
    
    if (surnameProgress % 500 === 0) {
      console.log(`   Progress: ${surnameProgress.toLocaleString()} / ${totalSurnames.toLocaleString()} surname groups analyzed...`);
    }

    // Only compare within same surname group
    for (let i = 0; i < surnameOwners.length; i++) {
      const owner = surnameOwners[i];
      
      if (processed.has(owner.normalized_owner)) continue;

      const normalizedName = normalizeForComparison(owner.normalized_owner);
      const potentialMatches: Array<{ 
        owner: OwnerStats; 
        score: number; 
        matchType: string;
        distance: number;
      }> = [];

      // Only compare with others in same surname group
      for (let j = i + 1; j < surnameOwners.length; j++) {
        const other = surnameOwners[j];
        
        if (processed.has(other.normalized_owner)) continue;

        const otherNormalized = normalizeForComparison(other.normalized_owner);

        // Skip if too different in length
        if (Math.abs(normalizedName.length - otherNormalized.length) > 10) continue;

        // Calculate Levenshtein with early exit
        const levDistance = levenshteinDistance(normalizedName, otherNormalized, 6);

        if (levDistance > 6) continue;

        let matchType = '';
        let confidence = 0;

        if (levDistance <= 2) {
          matchType = 'Levenshtein ≤ 2 (typo/minor variation)';
          confidence = 0.98;
        } else if (levDistance <= 4) {
          matchType = 'Levenshtein ≤ 4 (similar)';
          confidence = 0.92;
        } else if (levDistance <= 6) {
          // Check substring match for additional confidence
          if (normalizedName.includes(otherNormalized) || otherNormalized.includes(normalizedName)) {
            matchType = 'Levenshtein ≤ 6 + substring match';
            confidence = 0.88;
          } else {
            matchType = 'Levenshtein ≤ 6';
            confidence = 0.82;
          }
        }

        if (matchType) {
          potentialMatches.push({ 
            owner: other, 
            score: confidence, 
            matchType,
            distance: levDistance
          });
        }
      }

      if (potentialMatches.length > 0) {
        const members = [
          { 
            name: owner.normalized_owner, 
            parcels: owner.parcel_count,
            acres: Number(owner.total_acres)
          },
          ...potentialMatches.map(m => ({ 
            name: m.owner.normalized_owner,
            parcels: m.owner.parcel_count,
            acres: Number(m.owner.total_acres)
          }))
        ];
        
        const totalParcels = members.reduce((sum, m) => sum + m.parcels, 0);
        const avgConfidence = potentialMatches.reduce((sum, m) => sum + m.score, 0) / potentialMatches.length;

        groups.push({
          canonical: owner.normalized_owner,
          members,
          totalParcels,
          confidence: avgConfidence,
          matchType: potentialMatches[0].matchType
        });

        members.forEach(m => processed.add(m.name));
      } else {
        processed.add(owner.normalized_owner);
      }
    }
  }

  console.log(`\n✅ Analysis complete!\n`);
  console.log('='.repeat(70));
  console.log('📈 RESULTS\n');
  console.log(`Total unique owners (exact match): ${owners.length.toLocaleString()}`);
  console.log(`Potential fuzzy match groups found: ${groups.length.toLocaleString()}`);
  
  const totalMerged = groups.reduce((sum, g) => sum + g.members.length, 0);
  const uniqueAfterMerge = owners.length - groups.reduce((sum, g) => sum + g.members.length - 1, 0);
  
  console.log(`Owners that would be merged: ${totalMerged.toLocaleString()}`);
  console.log(`Estimated unique owners after merge: ${uniqueAfterMerge.toLocaleString()}`);
  
  const reduction = groups.reduce((sum, g) => sum + g.members.length - 1, 0);
  const reductionPct = (reduction / owners.length * 100).toFixed(1);
  console.log(`\nDuplicate variations found: ${reduction.toLocaleString()} (${reductionPct}%)`);

  // Show top candidates
  console.log('\n' + '='.repeat(70));
  console.log('🏆 TOP 30 MERGE CANDIDATES\n');

  const topGroups = groups
    .sort((a, b) => b.totalParcels - a.totalParcels)
    .slice(0, 30);

  topGroups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.canonical} (Confidence: ${(group.confidence * 100).toFixed(0)}%)`);
    console.log(`   Match Type: ${group.matchType}`);
    console.log(`   Total Parcels: ${group.totalParcels.toLocaleString()}`);
    console.log(`   Members (${group.members.length}):`);
    
    group.members.forEach(member => {
      console.log(`      - "${member.name}" (${member.parcels} parcels, ${Math.round(member.acres)} acres)`);
    });
    console.log();
  });

  // Confidence breakdown
  console.log('='.repeat(70));
  console.log('📊 CONFIDENCE BREAKDOWN\n');

  const highConfidence = groups.filter(g => g.confidence >= 0.95).length;
  const mediumConfidence = groups.filter(g => g.confidence >= 0.85 && g.confidence < 0.95).length;
  const lowConfidence = groups.filter(g => g.confidence < 0.85).length;

  console.log(`High Confidence (≥95%):    ${highConfidence.toLocaleString()} groups - Safe for auto-merge`);
  console.log(`Medium Confidence (85-95%): ${mediumConfidence.toLocaleString()} groups - Review recommended`);
  console.log(`Low Confidence (<85%):      ${lowConfidence.toLocaleString()} groups - Manual review required`);

  console.log('\n' + '='.repeat(70));
  console.log('💡 RECOMMENDATIONS\n');
  console.log(`1. Auto-merge high confidence groups: ${highConfidence.toLocaleString()} groups`);
  console.log(`2. Review medium confidence groups: ${mediumConfidence.toLocaleString()} groups`);
  console.log(`3. Skip or manual review low confidence: ${lowConfidence.toLocaleString()} groups`);
  console.log();
  console.log(`Estimated impact:`);
  console.log(`  - ${reduction.toLocaleString()} duplicate owner variations eliminated`);
  console.log(`  - ${reductionPct}% reduction in unique owners`);
  console.log(`  - More accurate land ownership representation`);
  console.log(`  - Fewer but larger parcel clusters on map`);
  console.log('\n' + '='.repeat(70));
}

// Parse command line arguments
const args = process.argv.slice(2);
const countyArg = args.find(arg => arg.startsWith('--county='));
const county = countyArg ? countyArg.split('=')[1].toUpperCase() : undefined;

analyzeOwnerNameVariations(county);
