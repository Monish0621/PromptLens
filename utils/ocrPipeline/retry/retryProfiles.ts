/**
 * Predefined OCR Retry Profiles
 *
 * Each profile modifies existing OCRConfig parameters (Tesseract PSM,
 * binarization threshold block size, contrast percentiles, upscale scale targets)
 * without modifying preprocessing algorithms or engine code.
 */
import type { RetryProfile, RetryProfileName } from './retryTypes';

export const RETRY_PROFILES: Record<RetryProfileName, RetryProfile> = {
  DEFAULT: {
    name: 'DEFAULT',
    description: 'Standard balanced profile',
    configOverrides: {},
  },

  CODE: {
    name: 'CODE',
    description: 'Monospaced code snippet profile with single uniform block PSM and tuned thresholding',
    configOverrides: {
      preprocessing: {
        trimTransparentBorders: true,
        normalizeOrientation:   true,
        enableUpscaling:        true,
        minUpscaleDimension:    300,
        maxUpscaleDimension:    1920,
        upscaleTargetDimension: 800,
        maxUpscaleScale:        2.5,
        enableGrayscale:        true,
        enableContrast:         true,
        contrastLowPercentile:  2,
        contrastHighPercentile: 98,
        enableThreshold:        true,
        thresholdBlockSize:     15,
        thresholdC:             8,
        enableMedianFilter:     false,
        medianKernelSize:       3,
        enableMorphology:       false,
        morphologyOperation:    'opening',
        morphologyKernelSize:   3,
        deskew:                 true,
        maxDeskewAngle:         10,
        minDeskewAngle:         0.5,
        deskewAngleStep:        0.5,
        sharpen:                true,
        sharpenAmount:          0.6,
      },
      engineOptions: {
        psm: 6,
        oem: 1,
        lang: 'eng',
      },
    },
  },

  DOCUMENT: {
    name: 'DOCUMENT',
    description: 'Multi-line prose document profile with automatic page segmentation PSM',
    configOverrides: {
      preprocessing: {
        trimTransparentBorders: true,
        normalizeOrientation:   true,
        enableUpscaling:        true,
        minUpscaleDimension:    300,
        maxUpscaleDimension:    1920,
        upscaleTargetDimension: 600,
        maxUpscaleScale:        2.0,
        enableGrayscale:        true,
        enableContrast:         true,
        contrastLowPercentile:  2,
        contrastHighPercentile: 98,
        enableThreshold:        true,
        thresholdBlockSize:     25,
        thresholdC:             12,
        enableMedianFilter:     true,
        medianKernelSize:       3,
        enableMorphology:       true,
        morphologyOperation:    'opening',
        morphologyKernelSize:   3,
        deskew:                 true,
        maxDeskewAngle:         10,
        minDeskewAngle:         0.5,
        deskewAngleStep:        0.5,
        sharpen:                true,
        sharpenAmount:          0.5,
      },
      engineOptions: {
        psm: 3,
        oem: 1,
        lang: 'eng',
      },
    },
  },

  LOW_RESOLUTION: {
    name: 'LOW_RESOLUTION',
    description: 'High-scale factor upscaling and unsharp masking for small cropped regions',
    configOverrides: {
      preprocessing: {
        trimTransparentBorders: true,
        normalizeOrientation:   true,
        enableUpscaling:        true,
        minUpscaleDimension:    500,
        maxUpscaleDimension:    1920,
        upscaleTargetDimension: 1200,
        maxUpscaleScale:        3.5,
        enableGrayscale:        true,
        enableContrast:         true,
        contrastLowPercentile:  1,
        contrastHighPercentile: 99,
        enableThreshold:        true,
        thresholdBlockSize:     19,
        thresholdC:             10,
        enableMedianFilter:     true,
        medianKernelSize:       3,
        enableMorphology:       false,
        morphologyOperation:    'opening',
        morphologyKernelSize:   3,
        deskew:                 true,
        maxDeskewAngle:         10,
        minDeskewAngle:         0.5,
        deskewAngleStep:        0.5,
        sharpen:                true,
        sharpenAmount:          0.85,
      },
      engineOptions: {
        psm: 6,
        oem: 1,
        lang: 'eng',
      },
    },
  },

  HIGH_CONTRAST: {
    name: 'HIGH_CONTRAST',
    description: 'Aggressive percentile histogram stretching and high C-offset thresholding',
    configOverrides: {
      preprocessing: {
        trimTransparentBorders: true,
        normalizeOrientation:   true,
        enableUpscaling:        true,
        minUpscaleDimension:    300,
        maxUpscaleDimension:    1920,
        upscaleTargetDimension: 600,
        maxUpscaleScale:        2.0,
        enableGrayscale:        true,
        enableContrast:         true,
        contrastLowPercentile:  5,
        contrastHighPercentile: 95,
        enableThreshold:        true,
        thresholdBlockSize:     21,
        thresholdC:             16,
        enableMedianFilter:     true,
        medianKernelSize:       3,
        enableMorphology:       true,
        morphologyOperation:    'opening',
        morphologyKernelSize:   3,
        deskew:                 true,
        maxDeskewAngle:         10,
        minDeskewAngle:         0.5,
        deskewAngleStep:        0.5,
        sharpen:                true,
        sharpenAmount:          0.5,
      },
      engineOptions: {
        psm: 6,
        oem: 1,
        lang: 'eng',
      },
    },
  },
};

export function getRetryProfile(name: RetryProfileName): RetryProfile {
  return RETRY_PROFILES[name] || RETRY_PROFILES.DEFAULT;
}
