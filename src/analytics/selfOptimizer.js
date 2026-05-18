export class SelfOptimizer {
  optimizeWeights(analytics) {
    const baseWeights = {
      commercialIntent: 0.35,
      searchVolume: 0.25,
      affiliateAvailability: 0.2,
      contentSaturation: -0.15,
      trendMomentum: 0.15,
    };

    // If affiliate earnings are strong, increase commercial intent weight
    if (analytics.earnings.affiliate > analytics.earnings.medium) {
      baseWeights.commercialIntent += 0.05;
      baseWeights.affiliateAvailability += 0.03;
    }

    // If Medium earnings are strong, increase search volume weight
    if (analytics.earnings.medium > analytics.earnings.affiliate) {
      baseWeights.searchVolume += 0.05;
      baseWeights.trendMomentum += 0.03;
    }

    // Normalize — ensure positive weights sum reasonably
    const positiveSum = Object.entries(baseWeights)
      .filter(([, v]) => v > 0)
      .reduce((sum, [, v]) => sum + v, 0);

    // Keep negative weight as-is
    return {
      commercialIntent: parseFloat(
        (baseWeights.commercialIntent / positiveSum).toFixed(3),
      ),
      searchVolume: parseFloat(
        (baseWeights.searchVolume / positiveSum).toFixed(3),
      ),
      affiliateAvailability: parseFloat(
        (baseWeights.affiliateAvailability / positiveSum).toFixed(3),
      ),
      contentSaturation: baseWeights.contentSaturation,
      trendMomentum: parseFloat(
        (baseWeights.trendMomentum / positiveSum).toFixed(3),
      ),
    };
  }

  extractTopNiches(analytics) {
    const niches = {};
    for (const cat of analytics.topPerformingCategories || []) {
      niches[cat.name] = cat.estimatedEarnings;
    }
    return niches;
  }
}
