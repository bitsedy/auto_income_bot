import axios from "axios";

export class LinkTracker {
  constructor() {
    this.dubcoKey = process.env.DUBCO_API_KEY;
    this.dubcoWorkspace = process.env.DUBCO_WORKSPACE_SLUG;
  }

  async createTrackedLinks(article) {
    if (!this.dubcoKey) {
      // Fallback: use direct affiliate links without tracking
      return article;
    }

    const trackedLinks = [];

    for (const link of article.affiliateLinks || []) {
      try {
        const shortLink = await this.createShortLink(
          link.amazonUrl,
          link.keyword,
        );
        trackedLinks.push({
          ...link,
          trackedUrl: shortLink,
          clicks: 0,
        });
      } catch (error) {
        trackedLinks.push(link); // Use original link if tracking fails
      }
    }

    // Replace URLs in content with tracked versions
    let content = typeof article.content === "string" ? article.content : "";
    for (const link of trackedLinks) {
      if (link.trackedUrl) {
        content = content.replace(link.amazonUrl, link.trackedUrl);
      }
    }

    return {
      ...article,
      content: content,
      affiliateLinks: trackedLinks,
    };
  }

  async createShortLink(longUrl, keyword) {
    try {
      const response = await axios.post(
        `https://api.dub.co/links?workspaceSlug=${this.dubcoWorkspace}`,
        {
          url: longUrl,
          key: keyword.replace(/\s+/g, "-").toLowerCase().slice(0, 30),
          tagIds: [],
        },
        {
          headers: {
            Authorization: `Bearer ${this.dubcoKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data?.shortLink || longUrl;
    } catch {
      return longUrl;
    }
  }

  async getClickStats(links) {
    if (!this.dubcoKey) return {};

    const stats = {};
    for (const link of links) {
      if (!link.trackedUrl) continue;
      try {
        const key = link.trackedUrl.split("/").pop();
        const response = await axios.get(
          `https://api.dub.co/analytics/clicks?key=${key}&workspaceSlug=${this.dubcoWorkspace}`,
          { headers: { Authorization: `Bearer ${this.dubcoKey}` } },
        );
        stats[link.keyword] = response.data?.clicks || 0;
      } catch {
        stats[link.keyword] = 0;
      }
    }
    return stats;
  }
}
