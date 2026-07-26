/**
 * Advanced OCR Framework — Core Types
 *
 * Single source of truth for BoundingBox, TextBlock, LayoutAnalysis,
 * TableStructure, OCRDocument, and AdvancedOCRStatistics.
 *
 * Framework Version: 1.0
 */

export const ADVANCED_FRAMEWORK_VERSION = '1.0';

export type LayoutType =
  | 'single_column'
  | 'multi_column'
  | 'code'
  | 'terminal'
  | 'table'
  | 'document'
  | 'unknown';

export type TextBlockType =
  | 'paragraph'
  | 'heading'
  | 'code'
  | 'terminal'
  | 'table'
  | 'quote'
  | 'inline'
  | 'unknown';

export interface BoundingBox {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface TextBlock {
  id:             string;
  type:           TextBlockType;
  boundingRegion: BoundingBox;
  lineCount:      number;
  confidence:     number;
  content:        string;
  lines:          string[];
}

export interface LayoutAnalysis {
  layoutType:   LayoutType;
  confidence:   number;
  regions:      BoundingBox[];
  readingOrder: string[];
}

export interface TableStructure {
  rows:       number;
  columns:    number;
  confidence: number;
  grid:       string[][];
}

export interface OCRDocument {
  layout:   LayoutAnalysis;
  blocks:   TextBlock[];
  tables:   TableStructure[];
  metadata: Record<string, unknown>;
}

export interface AdvancedOCRStatistics {
  regionCount:            number;
  blockCount:             number;
  tableCount:             number;
  layoutType:             LayoutType;
  layoutConfidence:       number;
  processingTimeMs:       number;
  readingOrderConfidence: number;
}
