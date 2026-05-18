// Filters scraped topics for safety, compliance, and ban avoidance.

const BLOCKED_PATTERNS = [
  /\b(?:hack|exploit|crack|warez|keygen|torrent|porn|xxx|sex|nude|escort|casino|gambling|pharma)\b/i,
  /\b(?:buy (?:followers|likes|views|traffic)|make money fast|get rich quick)\b/i,
  /\b(?:bitcoin doubler|elon musk|free (?:iphone|gift card))\b/i,
  /[\u0400-\u04FF]/, // Cyrillic spam (common in spam)
  /\b(?:trump|biden|election|vote|political)\b/i, // reduce controversial content
];

export function sanitizeTopics(topics) {
  return topics.filter((topic) => {
    const title = topic.title || "";
    if (BLOCKED_PATTERNS.some((pattern) => pattern.test(title))) {
      console.log(`   🛡️ Filtered unsafe topic: "${title}"`);
      return false;
    }
    return true;
  });
}

export function sanitizeDraft(draft) {
  // Block generation if the outline contains banned terms
  const fullText = JSON.stringify(draft);
  if (BLOCKED_PATTERNS.some((p) => p.test(fullText))) {
    throw new Error("Security block: banned pattern in generated draft");
  }
  return draft;
}
