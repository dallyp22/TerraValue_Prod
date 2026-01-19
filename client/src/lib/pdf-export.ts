/**
 * PDF Export Utilities for FarmScope AI Valuation Reports
 * Programmatic jsPDF rendering for crisp, professional output
 */

import jsPDF from 'jspdf';
import type { Valuation, ValuationBreakdown } from '@shared/schema';

// ============================================================================
// CONSTANTS
// ============================================================================

// Document specifications (mm)
export const PDF_SPEC = {
  format: 'a4' as const,
  width: 210,
  height: 297,
  margin: 15,
  headerHeight: 22,
  footerHeight: 12,
  contentWidth: 180, // 210 - 2*15
  usableHeight: 253, // 297 - 22 - 12 - 10
};

// Brand colors (RGB arrays for jsPDF)
export const COLORS = {
  fieldGreen: [45, 80, 22] as [number, number, number],
  gold: [212, 160, 60] as [number, number, number],
  terraBlack: [26, 24, 20] as [number, number, number],
  wheatCream: [250, 246, 237] as [number, number, number],
  warmGray500: [120, 116, 107] as [number, number, number],
  warmGray300: [211, 208, 201] as [number, number, number],
  insightPurple: [99, 102, 241] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  // CSR2 quality colors
  csr2Excellent: [45, 80, 22] as [number, number, number], // Field Green
  csr2Good: [212, 160, 60] as [number, number, number], // Gold
  csr2Fair: [193, 127, 36] as [number, number, number], // #c17f24
  csr2Poor: [139, 69, 19] as [number, number, number], // #8b4513
};

// Font sizes
export const FONTS = {
  heroValue: 24,
  title: 18,
  sectionHeader: 12,
  subheader: 11,
  body: 9,
  small: 8,
  label: 7,
  tiny: 6,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get CSR2 quality rating and corresponding color
 */
export function getCSR2Quality(value: number): { color: [number, number, number]; label: string } {
  if (value >= 82) return { color: COLORS.csr2Excellent, label: 'Excellent' };
  if (value >= 65) return { color: COLORS.csr2Good, label: 'Good' };
  if (value >= 50) return { color: COLORS.csr2Fair, label: 'Fair' };
  return { color: COLORS.csr2Poor, label: 'Poor' };
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number, short = false): string {
  if (short) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

/**
 * Wrap text to fit within a max width
 */
export function wrapText(pdf: jsPDF, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = pdf.getTextWidth(testLine);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Check if we need a page break and add one if necessary
 */
export function checkPageBreak(
  pdf: jsPDF,
  currentY: number,
  neededHeight: number,
  pageState: { pageNum: number; totalPages: number },
  valuation: Valuation
): number {
  const maxY = PDF_SPEC.height - PDF_SPEC.footerHeight - PDF_SPEC.margin;

  if (currentY + neededHeight > maxY) {
    pdf.addPage();
    pageState.pageNum++;
    drawHeader(pdf, pageState.pageNum, pageState.totalPages, valuation);
    return PDF_SPEC.headerHeight + 6; // Reset Y to below header
  }
  return currentY;
}

// ============================================================================
// DRAWING PRIMITIVES
// ============================================================================

/**
 * Draw the header on each page
 */
export function drawHeader(
  pdf: jsPDF,
  pageNum: number,
  totalPages: number,
  valuation: Valuation
): void {
  const { margin, width } = PDF_SPEC;

  // Header accent line
  pdf.setDrawColor(...COLORS.fieldGreen);
  pdf.setLineWidth(0.8);
  pdf.line(margin, 16, width - margin, 16);

  // FarmScope AI brand
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.fieldGreen);
  pdf.text('FarmScope AI', margin, 10);

  // Report title
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.terraBlack);
  const titleText = pageNum === 1 ? 'Property Valuation Report' : 'Property Valuation Report (continued)';
  pdf.text(titleText, margin + 40, 10);

  // Date on right
  pdf.setFontSize(FONTS.small);
  pdf.setTextColor(...COLORS.warmGray500);
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  pdf.text(currentDate, width - margin, 10, { align: 'right' });

  // Property info subtitle
  pdf.setFontSize(FONTS.small);
  pdf.setTextColor(...COLORS.warmGray500);
  const propertyInfo = valuation.address || `${valuation.county} County, ${valuation.state}`;
  pdf.text(propertyInfo, margin, 14);

  if (valuation.parcelNumber) {
    pdf.text(`Parcel #${valuation.parcelNumber}`, margin + 80, 14);
  }
  if (valuation.ownerName) {
    pdf.text(`Owner: ${valuation.ownerName}`, width - margin, 14, { align: 'right' });
  }
}

/**
 * Draw the footer on each page
 */
export function drawFooter(pdf: jsPDF, pageNum: number, totalPages: number): void {
  const { margin, width, height } = PDF_SPEC;
  const footerY = height - 10;

  // Footer line
  pdf.setDrawColor(...COLORS.warmGray300);
  pdf.setLineWidth(0.3);
  pdf.line(margin, footerY - 4, width - margin, footerY - 4);

  // Copyright
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('\u00A9 FarmScope AI Agricultural Valuation Platform', margin, footerY);

  // Page number
  pdf.setFontSize(FONTS.small);
  pdf.text(`Page ${pageNum} of ${totalPages}`, width - margin, footerY, { align: 'right' });

  // Disclaimer
  pdf.setFontSize(FONTS.tiny);
  pdf.text('This valuation is an estimate for informational purposes only.', margin, footerY + 3);
}

/**
 * Draw a section header bar
 */
export function drawSectionHeader(
  pdf: jsPDF,
  y: number,
  title: string,
  accentColor: [number, number, number] = COLORS.fieldGreen
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Background bar
  pdf.setFillColor(...accentColor);
  pdf.rect(margin, y, contentWidth, 7, 'F');

  // Title text
  pdf.setFontSize(FONTS.sectionHeader);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.white);
  pdf.text(title, margin + 3, y + 5);

  return y + 10; // Return new Y position
}

/**
 * Draw a rounded rectangle (card background)
 */
export function drawCard(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    fill?: [number, number, number];
    stroke?: [number, number, number];
    strokeWidth?: number;
  } = {}
): void {
  const { fill = COLORS.wheatCream, stroke, strokeWidth = 0.3 } = options;

  pdf.setFillColor(...fill);
  if (stroke) {
    pdf.setDrawColor(...stroke);
    pdf.setLineWidth(strokeWidth);
    pdf.roundedRect(x, y, w, h, 2, 2, 'FD');
  } else {
    pdf.roundedRect(x, y, w, h, 2, 2, 'F');
  }
}

/**
 * Draw a progress/percentage bar
 */
export function drawProgressBar(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  percent: number,
  color: [number, number, number] = COLORS.fieldGreen
): void {
  // Background
  pdf.setFillColor(...COLORS.warmGray300);
  pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'F');

  // Filled portion
  if (percent > 0) {
    const fillWidth = Math.max(h, w * Math.min(percent, 1));
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, fillWidth, h, h / 2, h / 2, 'F');
  }
}

/**
 * Draw a simple table
 */
export function drawTable(
  pdf: jsPDF,
  y: number,
  headers: string[],
  rows: (string | number)[][],
  columnWidths: number[],
  options: {
    headerColor?: [number, number, number];
    alternateRows?: boolean;
  } = {}
): number {
  const { margin } = PDF_SPEC;
  const { headerColor = COLORS.warmGray300, alternateRows = true } = options;
  const rowHeight = 7;
  let currentY = y;

  // Header row
  pdf.setFillColor(...headerColor);
  pdf.rect(margin, currentY, PDF_SPEC.contentWidth, rowHeight, 'F');
  pdf.setFontSize(FONTS.small);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);

  let xPos = margin + 2;
  headers.forEach((header, i) => {
    pdf.text(header, xPos, currentY + 5);
    xPos += columnWidths[i];
  });
  currentY += rowHeight;

  // Data rows
  pdf.setFont('helvetica', 'normal');
  rows.forEach((row, rowIndex) => {
    if (alternateRows && rowIndex % 2 === 0) {
      pdf.setFillColor(245, 243, 240);
      pdf.rect(margin, currentY, PDF_SPEC.contentWidth, rowHeight, 'F');
    }

    xPos = margin + 2;
    row.forEach((cell, i) => {
      const cellText = typeof cell === 'number' ? cell.toLocaleString() : cell;
      pdf.text(cellText, xPos, currentY + 5);
      xPos += columnWidths[i];
    });
    currentY += rowHeight;
  });

  return currentY + 2;
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

/**
 * Render the executive summary / total value card
 */
export function renderSummarySection(
  pdf: jsPDF,
  y: number,
  valuation: Valuation,
  breakdown: ValuationBreakdown,
  totalValue: number,
  selectedMethod: string,
  tillableAcres: number
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Card background
  drawCard(pdf, margin, y, contentWidth, 47, { stroke: COLORS.warmGray300 });

  // Total Property Value label
  pdf.setFontSize(FONTS.small);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('TOTAL PROPERTY VALUE', margin + 5, y + 8);

  // Hero value
  pdf.setFontSize(FONTS.heroValue);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.fieldGreen);
  pdf.text(formatCurrency(totalValue), margin + 5, y + 22);

  // Methodology note
  const methodLabels: Record<string, string> = {
    csr2: 'CSR2 Quantitative',
    income: 'Income Approach',
    ai_market: 'AI Market-Adjusted'
  };
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text(`Based on ${methodLabels[selectedMethod] || 'CSR2 Quantitative'} methodology`, margin + 5, y + 28);

  // Divider line
  pdf.setDrawColor(...COLORS.warmGray300);
  pdf.setLineWidth(0.2);
  pdf.line(margin + 5, y + 32, margin + contentWidth - 5, y + 32);

  // Three-column quick stats
  const statsY = y + 38;
  const colWidth = (contentWidth - 10) / 3;

  // Total Acres
  pdf.setFontSize(FONTS.label);
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('Total Acres', margin + 5, statsY);
  pdf.setFontSize(FONTS.subheader);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(valuation.acreage.toFixed(1), margin + 5, statsY + 5);

  // $/Acre Blended
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('$/Acre (Blended)', margin + 5 + colWidth, statsY);
  pdf.setFontSize(FONTS.subheader);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(formatCurrency(Math.round(totalValue / valuation.acreage)), margin + 5 + colWidth, statsY + 5);

  // Tillable %
  const tillablePct = ((tillableAcres / valuation.acreage) * 100).toFixed(0);
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('Tillable %', margin + 5 + colWidth * 2, statsY);
  pdf.setFontSize(FONTS.subheader);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(`${tillablePct}%`, margin + 5 + colWidth * 2, statsY + 5);

  return y + 52;
}

/**
 * Render CSR2 soil productivity analysis section
 */
export function renderCSR2Section(
  pdf: jsPDF,
  y: number,
  breakdown: ValuationBreakdown,
  valuation: Valuation
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Soil Productivity Analysis', COLORS.fieldGreen);

  const csr2Mean = breakdown.csr2Mean || 0;
  const quality = getCSR2Quality(csr2Mean);

  // Stats grid - 4 columns
  const colWidth = (contentWidth - 10) / 4;
  const cardY = y + 2;

  // CSR2 Rating with quality badge
  drawCard(pdf, margin, cardY, colWidth - 2, 20);
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('CSR2 RATING', margin + 3, cardY + 5);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(csr2Mean.toFixed(1), margin + 3, cardY + 13);
  // Quality badge
  pdf.setFillColor(...quality.color);
  pdf.roundedRect(margin + 20, cardY + 8, 18, 6, 1, 1, 'F');
  pdf.setFontSize(FONTS.tiny);
  pdf.setTextColor(...COLORS.white);
  pdf.text(quality.label, margin + 22, cardY + 12);

  // Soil Quality
  drawCard(pdf, margin + colWidth, cardY, colWidth - 2, 20);
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('SOIL QUALITY', margin + colWidth + 3, cardY + 5);
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...quality.color);
  pdf.text(quality.label, margin + colWidth + 3, cardY + 13);

  // Range
  drawCard(pdf, margin + colWidth * 2, cardY, colWidth - 2, 20);
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('RANGE', margin + colWidth * 2 + 3, cardY + 5);
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(`${breakdown.csr2Min || 0} - ${breakdown.csr2Max || 0}`, margin + colWidth * 2 + 3, cardY + 13);

  // Sample Points
  drawCard(pdf, margin + colWidth * 3, cardY, colWidth - 2, 20);
  pdf.setFontSize(FONTS.label);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('SAMPLE POINTS', margin + colWidth * 3 + 3, cardY + 5);
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(`${breakdown.csr2Count || 0}`, margin + colWidth * 3 + 3, cardY + 13);

  let currentY = cardY + 24;

  // Explanation text box
  drawCard(pdf, margin, currentY, contentWidth, 14, { fill: [245, 243, 240] as [number, number, number] });
  pdf.setFontSize(FONTS.small);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  const explanation = `CSR2 is Iowa State University's standardized soil productivity index (5-100 scale). Rating based on ${breakdown.csr2Count || 0} sample points within the parcel.`;
  const wrappedExplanation = wrapText(pdf, explanation, contentWidth - 10);
  wrappedExplanation.forEach((line, i) => {
    pdf.text(line, margin + 3, currentY + 5 + i * 4);
  });
  currentY += 16;

  // County rate callout if available
  if (breakdown.csr2DollarPerPoint) {
    drawCard(pdf, margin, currentY, contentWidth, 12, { stroke: COLORS.fieldGreen });
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.fieldGreen);
    pdf.text(`County Rate: $${breakdown.csr2DollarPerPoint}/point`, margin + 5, currentY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text(`Market rate per CSR2 point in ${valuation.county} County`, margin + 5, currentY + 10);
    currentY += 14;
  }

  return currentY + 4;
}

/**
 * Render valuation methods comparison section
 */
export function renderMethodsSection(
  pdf: jsPDF,
  y: number,
  methods: {
    csr2: { perAcre: number; confidence: number };
    income: { perAcre: number; confidence: number };
    ai_market: { perAcre: number; confidence: number };
  },
  selectedMethod: string
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Valuation Approaches', COLORS.fieldGreen);

  // Three method cards side by side
  const cardWidth = (contentWidth - 8) / 3;
  const cardHeight = 42;
  const cardY = y + 2;

  const methodConfig = [
    { key: 'csr2', label: 'CSR2 Quantitative', desc: 'Based on soil productivity' },
    { key: 'income', label: 'Income Approach', desc: 'Based on cash rent analysis' },
    { key: 'ai_market', label: 'AI Market-Adjusted', desc: 'AI adjusted with comparables' },
  ];

  methodConfig.forEach((method, index) => {
    const x = margin + index * (cardWidth + 4);
    const isSelected = selectedMethod === method.key;
    const data = methods[method.key as keyof typeof methods];

    // Card background
    drawCard(pdf, x, cardY, cardWidth, cardHeight, {
      fill: isSelected ? [240, 247, 235] as [number, number, number] : COLORS.white,
      stroke: isSelected ? COLORS.fieldGreen : COLORS.warmGray300,
      strokeWidth: isSelected ? 0.8 : 0.3,
    });

    // Method label
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...(isSelected ? COLORS.fieldGreen : COLORS.terraBlack));
    pdf.text(method.label, x + 3, cardY + 7);

    // Description
    pdf.setFontSize(FONTS.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text(method.desc, x + 3, cardY + 12);

    // Value per acre
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text(formatCurrency(data.perAcre), x + 3, cardY + 24);
    pdf.setFontSize(FONTS.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text('/acre', x + 3 + pdf.getTextWidth(formatCurrency(data.perAcre)) + 1, cardY + 24);

    // Confidence bar
    drawProgressBar(
      pdf,
      x + 3,
      cardY + 28,
      cardWidth - 6,
      3,
      data.confidence,
      isSelected ? COLORS.fieldGreen : COLORS.warmGray500
    );
    pdf.setFontSize(FONTS.tiny);
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text(`${(data.confidence * 100).toFixed(0)}% confidence`, x + 3, cardY + 36);

    // Selected checkmark
    if (isSelected) {
      pdf.setFillColor(...COLORS.fieldGreen);
      pdf.circle(x + cardWidth - 6, cardY + 6, 3, 'F');
      pdf.setTextColor(...COLORS.white);
      pdf.setFontSize(6);
      pdf.text('\u2713', x + cardWidth - 7.5, cardY + 7.5);
    }
  });

  // Summary bar below
  const summaryY = cardY + cardHeight + 4;
  drawCard(pdf, margin, summaryY, contentWidth, 10, { fill: [245, 243, 240] as [number, number, number] });
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text('\u2713 Selected:', margin + 5, summaryY + 6);
  pdf.setFont('helvetica', 'bold');
  const selectedLabel = methodConfig.find(m => m.key === selectedMethod)?.label || 'CSR2 Quantitative';
  pdf.text(selectedLabel, margin + 25, summaryY + 6);

  pdf.setTextColor(...COLORS.fieldGreen);
  const selectedValue = methods[selectedMethod as keyof typeof methods]?.perAcre || 0;
  pdf.text(formatCurrency(selectedValue) + '/acre', margin + contentWidth - 5, summaryY + 6, { align: 'right' });

  return summaryY + 14;
}

/**
 * Render land breakdown (tillable vs non-tillable)
 */
export function renderLandBreakdownSection(
  pdf: jsPDF,
  y: number,
  data: {
    tillableAcres: number;
    nonTillableAcres: number;
    tillablePerAcre: number;
    nonTillablePerAcre: number;
    tillableValue: number;
    nonTillableValue: number;
    totalValue: number;
    totalAcres: number;
    nonTillableType?: string;
    improvements?: number;
  }
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Land Breakdown', COLORS.gold);

  // Visual percentage bar
  const barY = y + 3;
  const tillablePct = data.tillableAcres / data.totalAcres;

  // Background
  pdf.setFillColor(...COLORS.warmGray300);
  pdf.roundedRect(margin, barY, contentWidth, 8, 2, 2, 'F');

  // Tillable portion (green)
  if (tillablePct > 0) {
    pdf.setFillColor(...COLORS.fieldGreen);
    pdf.roundedRect(margin, barY, contentWidth * tillablePct, 8, 2, 2, 'F');
  }

  // Labels on bar
  pdf.setFontSize(FONTS.tiny);
  pdf.setFont('helvetica', 'bold');
  if (tillablePct > 0.2) {
    pdf.setTextColor(...COLORS.white);
    pdf.text(`Tillable ${(tillablePct * 100).toFixed(0)}%`, margin + 3, barY + 5);
  }
  if (1 - tillablePct > 0.15) {
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text(`Non-Tillable ${((1 - tillablePct) * 100).toFixed(0)}%`, margin + contentWidth - 3, barY + 5, { align: 'right' });
  }

  // Breakdown table
  let currentY = barY + 14;

  // Table header
  pdf.setFillColor(...COLORS.warmGray300);
  pdf.rect(margin, currentY, contentWidth, 7, 'F');
  pdf.setFontSize(FONTS.small);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text('Land Type', margin + 3, currentY + 5);
  pdf.text('Acres', margin + 60, currentY + 5);
  pdf.text('$/Acre', margin + 95, currentY + 5);
  pdf.text('Total Value', margin + 130, currentY + 5, { align: 'left' });
  currentY += 8;

  // Tillable row
  pdf.setFillColor(245, 243, 240);
  pdf.rect(margin, currentY, contentWidth, 7, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(FONTS.body);
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text('Tillable Land', margin + 3, currentY + 5);
  pdf.text(data.tillableAcres.toFixed(2), margin + 60, currentY + 5);
  pdf.text(formatCurrency(data.tillablePerAcre), margin + 95, currentY + 5);
  pdf.text(formatCurrency(data.tillableValue), margin + 130, currentY + 5);
  currentY += 8;

  // Non-tillable row
  pdf.text('Non-Tillable Land', margin + 3, currentY + 5);
  if (data.nonTillableType) {
    pdf.setFontSize(FONTS.label);
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text(`(${data.nonTillableType})`, margin + 38, currentY + 5);
  }
  pdf.setFontSize(FONTS.body);
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(data.nonTillableAcres.toFixed(2), margin + 60, currentY + 5);
  pdf.text(formatCurrency(data.nonTillablePerAcre), margin + 95, currentY + 5);
  pdf.text(formatCurrency(data.nonTillableValue), margin + 130, currentY + 5);
  currentY += 8;

  // Improvements row (if present)
  if (data.improvements && data.improvements > 0) {
    pdf.setFillColor(245, 243, 240);
    pdf.rect(margin, currentY, contentWidth, 7, 'F');
    pdf.text('Improvements', margin + 3, currentY + 5);
    pdf.text('-', margin + 60, currentY + 5);
    pdf.text('-', margin + 95, currentY + 5);
    pdf.text(formatCurrency(data.improvements), margin + 130, currentY + 5);
    currentY += 8;
  }

  // Total row
  pdf.setFillColor(...COLORS.fieldGreen);
  pdf.rect(margin, currentY, contentWidth, 8, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.white);
  pdf.text('TOTAL', margin + 3, currentY + 6);
  pdf.text(data.totalAcres.toFixed(2), margin + 60, currentY + 6);
  pdf.text('-', margin + 95, currentY + 6);
  pdf.setFontSize(10);
  pdf.text(formatCurrency(data.totalValue), margin + 130, currentY + 6);

  return currentY + 12;
}

/**
 * Render parcel information section
 */
export function renderParcelSection(
  pdf: jsPDF,
  y: number,
  valuation: Valuation
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Parcel Information', COLORS.warmGray500);

  drawCard(pdf, margin, y + 2, contentWidth, 16, { fill: COLORS.white, stroke: COLORS.warmGray300 });

  const colWidth = contentWidth / 3;
  const infoY = y + 9;

  // Owner
  if (valuation.ownerName) {
    pdf.setFontSize(FONTS.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text('OWNER', margin + 5, infoY);
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text(valuation.ownerName, margin + 5, infoY + 5);
  }

  // Parcel number
  if (valuation.parcelNumber) {
    pdf.setFontSize(FONTS.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text('PARCEL #', margin + 5 + colWidth, infoY);
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text(valuation.parcelNumber, margin + 5 + colWidth, infoY + 5);
  }

  // Address
  if (valuation.address) {
    pdf.setFontSize(FONTS.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.warmGray500);
    pdf.text('ADDRESS', margin + 5 + colWidth * 2, infoY);
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    const addressLines = wrapText(pdf, valuation.address, colWidth - 10);
    pdf.text(addressLines[0] || '', margin + 5 + colWidth * 2, infoY + 5);
  }

  return y + 22;
}

/**
 * Render market analysis section
 */
export function renderMarketSection(
  pdf: jsPDF,
  y: number,
  breakdown: ValuationBreakdown,
  valuation: Valuation
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Iowa Market Analysis', COLORS.insightPurple);

  // Market summary text box
  if (breakdown.iowaMarketSummary) {
    drawCard(pdf, margin, y + 2, contentWidth, 16, { fill: [245, 243, 255] as [number, number, number], stroke: COLORS.insightPurple });
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.terraBlack);
    const summaryLines = wrapText(pdf, breakdown.iowaMarketSummary, contentWidth - 10);
    summaryLines.slice(0, 3).forEach((line, i) => {
      pdf.text(line, margin + 5, y + 8 + i * 4);
    });
    y += 20;
  }

  // Comparables table
  const comps = breakdown.iowaMarketComps || [];
  if (comps.length > 0) {
    let tableY = y + 4;

    // Table header
    pdf.setFillColor(...COLORS.warmGray300);
    pdf.rect(margin, tableY, contentWidth, 7, 'F');
    pdf.setFontSize(FONTS.small);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text('Date', margin + 3, tableY + 5);
    pdf.text('Price/Acre', margin + 28, tableY + 5);
    pdf.text('Details', margin + 60, tableY + 5);
    pdf.text('Acres', margin + 130, tableY + 5);
    pdf.text('County', margin + 155, tableY + 5);
    tableY += 8;

    // Data rows (max 5)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FONTS.small);
    comps.slice(0, 5).forEach((comp: any, index: number) => {
      if (index % 2 === 0) {
        pdf.setFillColor(245, 243, 240);
        pdf.rect(margin, tableY, contentWidth, 7, 'F');
      }

      pdf.setTextColor(...COLORS.terraBlack);
      pdf.text(comp.date || '-', margin + 3, tableY + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatCurrency(comp.price_per_acre), margin + 28, tableY + 5);
      pdf.setFont('helvetica', 'normal');

      // Truncate details if too long
      const details = comp.details || '-';
      const truncatedDetails = details.length > 40 ? details.substring(0, 37) + '...' : details;
      pdf.text(truncatedDetails, margin + 60, tableY + 5);

      pdf.text(comp.acres ? comp.acres.toString() : '-', margin + 130, tableY + 5);
      pdf.text(comp.county || valuation.county, margin + 155, tableY + 5);
      tableY += 7;
    });

    y = tableY;
  }

  // Average comparable price
  if (breakdown.marketCompsAverage) {
    y += 2;
    drawCard(pdf, margin, y, contentWidth, 10, { fill: [245, 243, 240] as [number, number, number] });
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text('Average Comparable Price:', margin + 5, y + 6);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatCurrency(breakdown.marketCompsAverage) + '/acre', margin + contentWidth - 5, y + 6, { align: 'right' });
    y += 12;
  }

  // Market trends
  if (breakdown.iowaMarketTrends?.factors && breakdown.iowaMarketTrends.factors.length > 0) {
    y += 2;
    pdf.setFontSize(FONTS.small);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text('Market Factors:', margin, y + 4);
    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FONTS.small);
    breakdown.iowaMarketTrends.factors.slice(0, 3).forEach((factor: string) => {
      pdf.text('\u2022 ' + factor, margin + 3, y + 4);
      y += 5;
    });
  }

  return y + 4;
}

/**
 * Render suggested rent section
 */
export function renderRentSection(
  pdf: jsPDF,
  y: number,
  breakdown: ValuationBreakdown
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Suggested Annual Rent', COLORS.gold);

  // Gold accent card
  drawCard(pdf, margin, y + 2, contentWidth, 28, { fill: [255, 250, 235] as [number, number, number], stroke: COLORS.gold });

  // Large rent value
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.terraBlack);
  pdf.text(`$${breakdown.suggestedRentPerAcre}/acre`, margin + 5, y + 14);

  // Formula explanation
  pdf.setFontSize(FONTS.body);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.warmGray500);
  const formula = `Corn futures $${breakdown.cornFuturesPrice?.toFixed(2)}/bu \u00D7 ${breakdown.csr2Mean?.toFixed(1)} CSR2`;
  pdf.text(formula, margin + 5, y + 21);

  pdf.setFontSize(FONTS.label);
  pdf.text('Formula: Corn Price \u00D7 CSR2 = Suggested Annual Rent', margin + 5, y + 27);

  return y + 34;
}

/**
 * Render detailed soil analysis section
 */
export function renderSoilSection(
  pdf: jsPDF,
  y: number,
  valuation: Valuation
): number {
  const { margin, contentWidth } = PDF_SPEC;

  // Section header
  y = drawSectionHeader(pdf, y, 'Detailed Soil Data', COLORS.fieldGreen);

  // Soil series info
  if (valuation.soilSeries) {
    drawCard(pdf, margin, y + 2, contentWidth, 12, { fill: COLORS.white, stroke: COLORS.warmGray300 });
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text(`Soil Series: ${valuation.soilSeries}`, margin + 5, y + 9);
    if (valuation.mukey) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.warmGray500);
      pdf.text(`MUKEY: ${valuation.mukey}`, margin + contentWidth - 5, y + 9, { align: 'right' });
    }
    y += 16;
  }

  // Physical characteristics table
  const characteristics = [
    ['Slope', valuation.soilSlope ? `${valuation.soilSlope}%` : '-'],
    ['Drainage', valuation.soilDrainage || '-'],
    ['Hydrologic Group', valuation.soilHydrologicGroup || '-'],
    ['Farmland Class', valuation.soilFarmlandClass || '-'],
    ['Texture', valuation.soilTexture || '-'],
  ].filter(([_, val]) => val !== '-');

  if (characteristics.length > 0) {
    let tableY = y + 2;

    // Two-column layout for characteristics
    const halfWidth = (contentWidth - 4) / 2;
    characteristics.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * (halfWidth + 4);
      const currentY = tableY + row * 8;

      if (col === 0) {
        pdf.setFillColor(245, 243, 240);
        pdf.rect(margin, currentY, contentWidth, 7, 'F');
      }

      pdf.setFontSize(FONTS.small);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.warmGray500);
      pdf.text(label + ':', x + 3, currentY + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.terraBlack);
      pdf.text(value, x + 40, currentY + 5);
    });

    y = tableY + Math.ceil(characteristics.length / 2) * 8 + 4;
  }

  // Surface horizon composition (Sand/Silt/Clay)
  if (valuation.soilSandPct || valuation.soilSiltPct || valuation.soilClayPct) {
    pdf.setFontSize(FONTS.body);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.terraBlack);
    pdf.text('Surface Horizon Composition', margin, y + 4);
    y += 8;

    const compositions = [
      { label: 'Sand', value: valuation.soilSandPct || 0, color: [194, 178, 128] as [number, number, number] },
      { label: 'Silt', value: valuation.soilSiltPct || 0, color: [139, 119, 101] as [number, number, number] },
      { label: 'Clay', value: valuation.soilClayPct || 0, color: [101, 67, 33] as [number, number, number] },
    ];

    compositions.forEach((comp, index) => {
      const barY = y + index * 10;

      pdf.setFontSize(FONTS.small);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.terraBlack);
      pdf.text(comp.label, margin, barY + 4);

      drawProgressBar(pdf, margin + 20, barY, 80, 5, comp.value / 100, comp.color);

      pdf.setFont('helvetica', 'bold');
      pdf.text(`${comp.value.toFixed(1)}%`, margin + 105, barY + 4);
    });

    y += 32;
  }

  // pH and Organic Matter
  if (valuation.soilPH || valuation.soilOrganicMatter) {
    const halfWidth = (contentWidth - 4) / 2;

    if (valuation.soilPH) {
      drawCard(pdf, margin, y, halfWidth, 14);
      pdf.setFontSize(FONTS.label);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.warmGray500);
      pdf.text('SOIL pH', margin + 5, y + 5);
      pdf.setFontSize(FONTS.subheader);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.terraBlack);
      pdf.text(valuation.soilPH.toFixed(1), margin + 5, y + 11);

      // pH quality indicator
      const phQuality = valuation.soilPH >= 6.0 && valuation.soilPH <= 7.5 ? 'Optimal' :
                        valuation.soilPH >= 5.5 && valuation.soilPH <= 8.0 ? 'Acceptable' : 'Needs attention';
      const phColor = phQuality === 'Optimal' ? COLORS.fieldGreen :
                      phQuality === 'Acceptable' ? COLORS.gold : COLORS.csr2Poor;
      pdf.setFontSize(FONTS.tiny);
      pdf.setTextColor(...phColor);
      pdf.text(phQuality, margin + 25, y + 11);
    }

    if (valuation.soilOrganicMatter) {
      drawCard(pdf, margin + halfWidth + 4, y, halfWidth, 14);
      pdf.setFontSize(FONTS.label);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLORS.warmGray500);
      pdf.text('ORGANIC MATTER', margin + halfWidth + 9, y + 5);
      pdf.setFontSize(FONTS.subheader);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLORS.terraBlack);
      pdf.text(`${valuation.soilOrganicMatter.toFixed(1)}%`, margin + halfWidth + 9, y + 11);

      // OM quality indicator
      const omQuality = valuation.soilOrganicMatter >= 4.0 ? 'Excellent' :
                        valuation.soilOrganicMatter >= 2.5 ? 'Good' : 'Low';
      const omColor = omQuality === 'Excellent' ? COLORS.fieldGreen :
                      omQuality === 'Good' ? COLORS.gold : COLORS.csr2Poor;
      pdf.setFontSize(FONTS.tiny);
      pdf.setTextColor(...omColor);
      pdf.text(omQuality, margin + halfWidth + 45, y + 11);
    }

    y += 18;
  }

  // USDA SSURGO source note
  drawCard(pdf, margin, y, contentWidth, 8, { fill: [245, 243, 240] as [number, number, number] });
  pdf.setFontSize(FONTS.tiny);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(...COLORS.warmGray500);
  pdf.text('Data source: USDA SSURGO Soil Database', margin + 5, y + 5);

  return y + 12;
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export interface PDFExportOptions {
  valuation: Valuation;
  breakdown: ValuationBreakdown;
  selectedMethod: 'csr2' | 'income' | 'ai_market';
  totalValue: number;
  tillableAcres: number;
  nonTillableAcres: number;
  tillablePerAcre: number;
  nonTillablePerAcre: number;
  tillableValue: number;
  nonTillableValue: number;
  improvements: number;
  valuationMethods: {
    csr2: { perAcre: number; confidence: number };
    income: { perAcre: number; confidence: number };
    ai_market: { perAcre: number; confidence: number };
  };
}

/**
 * Generate a professional PDF report
 */
export async function generatePDF(options: PDFExportOptions): Promise<void> {
  const {
    valuation,
    breakdown,
    selectedMethod,
    totalValue,
    tillableAcres,
    nonTillableAcres,
    tillablePerAcre,
    nonTillablePerAcre,
    tillableValue,
    nonTillableValue,
    improvements,
    valuationMethods,
  } = options;

  // Calculate total pages needed (estimate)
  let estimatedPages = 1;
  if (breakdown.iowaMarketComps && breakdown.iowaMarketComps.length > 0) estimatedPages++;
  if (valuation.soilSeries) estimatedPages++;

  // Create PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageState = { pageNum: 1, totalPages: estimatedPages };

  // ========== PAGE 1: Executive Summary ==========
  drawHeader(pdf, 1, pageState.totalPages, valuation);
  let y = PDF_SPEC.headerHeight + 6;

  // Section 1: Total Value Card
  y = renderSummarySection(pdf, y, valuation, breakdown, totalValue, selectedMethod, tillableAcres);
  y += 5;

  // Section 2: CSR2 Summary (if available)
  if (breakdown.csr2Mean) {
    y = checkPageBreak(pdf, y, 50, pageState, valuation);
    y = renderCSR2Section(pdf, y, breakdown, valuation);
    y += 3;
  }

  // Section 3: Valuation Methods
  y = checkPageBreak(pdf, y, 60, pageState, valuation);
  y = renderMethodsSection(pdf, y, valuationMethods, selectedMethod);

  drawFooter(pdf, pageState.pageNum, pageState.totalPages);

  // ========== PAGE 2: Land Analysis ==========
  pdf.addPage();
  pageState.pageNum++;
  drawHeader(pdf, pageState.pageNum, pageState.totalPages, valuation);
  y = PDF_SPEC.headerHeight + 6;

  // Section 4: Tillable vs Non-Tillable
  y = renderLandBreakdownSection(pdf, y, {
    tillableAcres,
    nonTillableAcres,
    tillablePerAcre,
    nonTillablePerAcre,
    tillableValue,
    nonTillableValue,
    totalValue,
    totalAcres: valuation.acreage,
    nonTillableType: breakdown.nonTillableType,
    improvements,
  });
  y += 5;

  // Section 5: Parcel Information (if data exists)
  if (valuation.ownerName || valuation.parcelNumber) {
    y = checkPageBreak(pdf, y, 25, pageState, valuation);
    y = renderParcelSection(pdf, y, valuation);
    y += 3;
  }

  // Section 6: Suggested Rent (if data exists)
  if (breakdown.suggestedRentPerAcre && breakdown.cornFuturesPrice) {
    y = checkPageBreak(pdf, y, 38, pageState, valuation);
    y = renderRentSection(pdf, y, breakdown);
  }

  drawFooter(pdf, pageState.pageNum, pageState.totalPages);

  // ========== PAGE 3: Market Analysis (if comps exist) ==========
  if (breakdown.iowaMarketComps && breakdown.iowaMarketComps.length > 0) {
    pdf.addPage();
    pageState.pageNum++;
    drawHeader(pdf, pageState.pageNum, pageState.totalPages, valuation);
    y = PDF_SPEC.headerHeight + 6;

    y = renderMarketSection(pdf, y, breakdown, valuation);

    drawFooter(pdf, pageState.pageNum, pageState.totalPages);
  }

  // ========== PAGE 4: Soil Analysis (if soil data exists) ==========
  if (valuation.soilSeries) {
    pdf.addPage();
    pageState.pageNum++;
    drawHeader(pdf, pageState.pageNum, pageState.totalPages, valuation);
    y = PDF_SPEC.headerHeight + 6;

    y = renderSoilSection(pdf, y, valuation);

    drawFooter(pdf, pageState.pageNum, pageState.totalPages);
  }

  // Update total pages on all pages
  const actualTotalPages = pageState.pageNum;
  for (let i = 1; i <= actualTotalPages; i++) {
    pdf.setPage(i);
    // Redraw footer with correct total
    drawFooter(pdf, i, actualTotalPages);
  }

  // Generate filename and save
  const propertyAddress = valuation.address?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Property';
  const filename = `FarmScope_AI_Valuation_${propertyAddress}_${new Date().toISOString().split('T')[0]}.pdf`;

  pdf.save(filename);
}
