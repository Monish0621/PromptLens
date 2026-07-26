/**
 * Filter Group & Priority Framework
 *
 * Defines explicit FilterGroup categories and intra-group priority constants.
 *
 * Execution ordering strategy:
 *   1. FilterGroup (ascending: NORMALIZATION=1 → FINALIZATION=6)
 *   2. Priority    (ascending inside the group: 10, 20, 30...)
 *
 * Registration order in imageNormalizer.ts is completely irrelevant.
 * The filter runner sorts by (group, priority) before executing.
 */

export enum FilterGroup {
  NORMALIZATION = 1,
  ENHANCEMENT   = 2,
  BINARIZATION  = 3,
  CLEANUP       = 4,
  GEOMETRY      = 5,
  FINALIZATION  = 6,
}

/** Intra-group priorities (ordering within each group) */
export const FILTER_PRIORITY = {
  // Normalization (Group 1)
  TRIM:       10,

  // Enhancement (Group 2)
  UPSCALE:    10,
  GRAYSCALE:  20,
  CONTRAST:   30,

  // Binarization (Group 3)
  THRESHOLD:  10,

  // Cleanup (Group 4)
  MEDIAN:     10,
  MORPHOLOGY: 20,

  // Geometry (Group 5)
  DESKEW:     10,

  // Finalization (Group 6)
  SHARPEN:    10,
} as const;

export type FilterPriority = typeof FILTER_PRIORITY[keyof typeof FILTER_PRIORITY];

/**
 * Human-readable label for a FilterGroup enum value.
 */
export function filterGroupLabel(group: FilterGroup): string {
  switch (group) {
    case FilterGroup.NORMALIZATION: return 'Normalization';
    case FilterGroup.ENHANCEMENT:   return 'Enhancement';
    case FilterGroup.BINARIZATION:  return 'Binarization';
    case FilterGroup.CLEANUP:       return 'Cleanup';
    case FilterGroup.GEOMETRY:      return 'Geometry';
    case FilterGroup.FINALIZATION:  return 'Finalization';
    default:                        return 'Unknown';
  }
}
