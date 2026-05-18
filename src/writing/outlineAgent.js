export class TopicScorer {
  constructor(customWeights = null, topNiches = {}) {
    this.weights = customWeights || {
      commercialIntent: 0.35,
      searchVolume: 0.25,
      affiliateAvailability: 0.2,
      contentSaturation: -0.15,
      trendMomentum: 0.15,
    };
    this.topNiches = topNiches;
  }

  scoreAndRank(topics) {
    // Deduplicate by title similarity
    const unique = this.deduplicate(topics);

    // Score each topic
    const scored = unique.map((topic) => ({
      ...topic,
      slug: this.slugify(topic.title),
      tags: this.extractTags(topic),
      ...this.calculateScores(topic),
    }));

    // Boost topics in proven niches
    const withNicheBoost = scored.map((topic) => ({
      ...topic,
      score: topic.score + this.getNicheBoost(topic),
    }));

    // Sort by score descending
    return withNicheBoost.sort((a, b) => b.score - a.score);
  }

  calculateScores(topic) {
    const title = topic.title.toLowerCase();
    const text = (topic.title + " " + (topic.selftext || "")).toLowerCase();

    // 1. Commercial Intent Score (0-1)
    const buyerKeywords = [
      "best",
      "review",
      "vs",
      "comparison",
      "under",
      "budget",
      "cheap",
      "worth",
      "buy",
      "recommend",
      "top",
      "affordable",
      "alternative to",
    ];
    const intentMatches = buyerKeywords.filter((kw) => text.includes(kw));
    const commercialIntent = Math.min(1, intentMatches.length / 4);

    // 2. Search Volume Signal (0-1)
    let searchVolume = 0.5;
    if (
      topic.rawVolume === "high" ||
      topic.score > 500 ||
      topic.votesCount > 300
    )
      searchVolume = 0.9;
    else if (
      topic.rawVolume === "medium" ||
      topic.score > 200 ||
      topic.votesCount > 100
    )
      searchVolume = 0.6;
    else if (topic.score > 50 || topic.votesCount > 30) searchVolume = 0.4;

    // 3. Affiliate Product Availability (0-1)
    const productKeywords = [
      "headphone",
      "laptop",
      "monitor",
      "keyboard",
      "mouse",
      "chair",
      "desk",
      "phone",
      "camera",
      "watch",
      "tablet",
      "speaker",
      "tool",
      "software",
      "subscription",
      "course",
      "book",
    ];
    const productMatches = productKeywords.filter((kw) => text.includes(kw));
    const affiliateAvailability = Math.min(1, productMatches.length / 3);

    // 4. Content Saturation Penalty (0-1, higher = more saturated)
    // Topics with very generic titles are likely saturated
    const genericPhrases = [
      "how to",
      "what is",
      "guide to",
      "introduction",
      "basics of",
    ];
    const isGeneric =
      genericPhrases.some((p) => title.includes(p)) &&
      title.split(" ").length < 6;
    const contentSaturation = isGeneric ? 0.7 : 0.3;

    // 5. Trend Momentum (0-1) — recency + engagement velocity
    let trendMomentum = 0.5;
    if (topic.numComments > 50 || topic.commentsCount > 20) trendMomentum = 0.8;
    if (topic.pubDate) {
      const hoursAgo =
        (Date.now() - new Date(topic.pubDate).getTime()) / 3600000;
      if (hoursAgo < 6) trendMomentum = Math.max(trendMomentum, 0.9);
      else if (hoursAgo < 24) trendMomentum = Math.max(trendMomentum, 0.7);
      else if (hoursAgo > 72) trendMomentum = Math.max(trendMomentum, 0.3);
    }

    // Weighted total score
    const score =
      commercialIntent * this.weights.commercialIntent +
      searchVolume * this.weights.searchVolume +
      affiliateAvailability * this.weights.affiliateAvailability +
      contentSaturation * this.weights.contentSaturation +
      trendMomentum * this.weights.trendMomentum;

    return {
      commercialIntent: commercialIntent.toFixed(2),
      searchVolume: searchVolume.toFixed(2),
      affiliateAvailability: affiliateAvailability.toFixed(2),
      contentSaturation: contentSaturation.toFixed(2),
      trendMomentum: trendMomentum.toFixed(2),
      score: Math.max(0, Math.min(1, score)),
    };
  }

  getNicheBoost(topic) {
    if (!topic.category || Object.keys(this.topNiches).length === 0) return 0;
    const categoryEarnings = this.topNiches[topic.category];
    if (!categoryEarnings) return 0;
    // Boost proven categories by up to 0.15
    return Math.min(0.15, categoryEarnings * 0.01);
  }

  deduplicate(topics) {
    const seen = new Set();
    return topics.filter((t) => {
      const key = this.slugify(t.title).slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  }

  extractTags(topic) {
    const tags = [topic.category].filter(Boolean);
    const text = topic.title.toLowerCase();
    if (text.includes("ai") || text.includes("artificial intelligence"))
      tags.push("ai");
    if (text.includes("review")) tags.push("review");
    if (text.includes("best")) tags.push("best-of");
    if (text.includes("vs")) tags.push("comparison");
    return [...new Set(tags)];
  }
}
