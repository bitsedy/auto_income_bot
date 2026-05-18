import Anthropic from "@anthropic-ai/sdk";

export class LinkInjector {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.associateTag = process.env.AMAZON_ASSOCIATE_TAG || "default-20";
  }

  async injectLinks(optimizedArticle, topic) {
    // Identify link opportunities
    const opportunities = await this.findLinkOpportunities(
      optimizedArticle,
      topic,
    );

    // Build Amazon search URLs for each opportunity
    const affiliateLinks = opportunities.map((opp) => ({
      keyword: opp.keyword,
      amazonUrl: `https://www.amazon.com/s?k=${encodeURIComponent(opp.keyword)}&tag=${this.associateTag}`,
      context: opp.context,
      placement: opp.placement,
    }));

    // Inject links naturally into the article text
    const enrichedContent = this.insertLinks(optimizedArticle, affiliateLinks);

    return {
      ...optimizedArticle,
      content: enrichedContent,
      affiliateLinks: affiliateLinks,
    };
  }

  async findLinkOpportunities(article, topic) {
    const articleText = this.flattenArticle(article);

    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 500,
      system: `Identify 3-5 natural opportunities for affiliate product links in an article. 
Focus on product names, categories, or buying-intent phrases.
Format each as: product keyword | sentence context`,
      messages: [
        {
          role: "user",
          content: `Find 3-5 product linking opportunities in this article about "${topic.title}".
For each, identify: the product/category keyword AND the sentence where it would fit naturally.

Article text:
${articleText.slice(0, 3000)}

Return as JSON array: [{"keyword": "...", "context": "...", "placement": "sentence where link fits"}]`,
        },
      ],
    });

    try {
      const text = response.content[0].text;
      const jsonStart = text.indexOf("[");
      const jsonEnd = text.lastIndexOf("]") + 1;
      return JSON.parse(text.slice(jsonStart, jsonEnd));
    } catch (e) {
      // Fallback: extract product mentions from the category
      const fallbackProducts = {
        "tech-gadgets": [
          "wireless headphones",
          "mechanical keyboard",
          "USB-C hub",
        ],
        "home-office": ["standing desk", "ergonomic chair", "monitor arm"],
        "software-reviews": [
          "productivity app",
          "project management tool",
          "note-taking software",
        ],
        "developer-tools": ["code editor", "API client", "cloud hosting"],
        productivity: ["planner", "time tracker", "focus app"],
      };
      const products = fallbackProducts[topic.category] || [
        "recommended product",
      ];
      return products.map((p) => ({
        keyword: p,
        context: `looking for the best ${p}`,
        placement: "body",
      }));
    }
  }

  insertLinks(article, affiliateLinks) {
    let content = this.flattenArticle(article);

    for (const link of affiliateLinks) {
      const keyword = link.keyword;
      const url = link.amazonUrl;

      // Find natural keyword occurrence and add link
      const regex = new RegExp(
        `\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`,
        "gi",
      );
      const matches = [...content.matchAll(regex)];

      if (matches.length > 0) {
        // Link the second occurrence (first might be in heading)
        const matchIndex = Math.min(1, matches.length - 1);
        const match = matches[matchIndex];
        const linked = `<a href="${url}" rel="nofollow sponsored" target="_blank">${match[1]}</a>`;
        content =
          content.slice(0, match.index) +
          linked +
          content.slice(match.index + match[0].length);
      } else {
        // If no natural occurrence, append a subtle mention
        content += `\n\n> 💡 *Looking for a good ${keyword}? [Check current prices on Amazon](${url}).*`;
      }
    }

    return content;
  }

  flattenArticle(article) {
    let text = `${article.intro}\n\n`;
    for (const s of article.sections) {
      text += `${s.content}\n\n`;
      if (s.subsections) {
        for (const sub of s.subsections) {
          text += `${sub.content}\n\n`;
        }
      }
    }
    text += article.conclusion;
    return text;
  }
}