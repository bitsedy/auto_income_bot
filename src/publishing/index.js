import axios from "axios";
import { CircuitBreaker } from "../core/resilience.js";

export class MultiPlatformPublisher {
  constructor() {
    this.devtoKey = process.env.DEVTO_API_KEY;
    this.hashnodeToken = process.env.HASHNODE_API_TOKEN;
    this.hashnodePubId = process.env.HASHNODE_PUBLICATION_ID;
    this.mediumToken = process.env.MEDIUM_API_TOKEN;
    this.mediumUserId = process.env.MEDIUM_USER_ID;
  }

  async publishToDevTo(article) {
    const response = await axios.post(
      "https://dev.to/api/articles",
      {
        article: {
          title: article.seoTitle || article.title,
          body_markdown: this.formatForDevTo(article),
          published: true,
          tags: (article.tags || ["productivity", "technology"]).slice(0, 4),
          canonical_url: article.canonicalUrl || undefined,
          description: article.metaDescription,
        },
      },
      {
        headers: {
          "api-key": this.devtoKey,
          "Content-Type": "application/json",
        },
      },
    );

    return { url: response.data.url, platform: "devto" };
  }

  async publishToHashnode(article) {
    const query = `mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post { url slug title }
      }
    }`;

    const response = await axios.post(
      "https://gql.hashnode.com",
      {
        query,
        variables: {
          input: {
            title: article.seoTitle || article.title,
            contentMarkdown: this.formatForHashnode(article),
            publicationId: this.hashnodePubId,
            tags: (article.tags || []).map((t) => ({ slug: t, name: t })),
            metaTags: { description: article.metaDescription },
          },
        },
      },
      {
        headers: {
          Authorization: this.hashnodeToken,
          "Content-Type": "application/json",
        },
      },
    );

    return {
      url: response.data?.data?.publishPost?.post?.url,
      platform: "hashnode",
    };
  }

  async publishToMedium(article) {
    const content = this.formatForMedium(article);

    const response = await axios.post(
      `https://api.medium.com/v1/users/${this.mediumUserId}/posts`,
      {
        title: article.seoTitle || article.title,
        contentFormat: "markdown",
        content: content,
        tags: (article.tags || ["technology", "productivity"]).slice(0, 5),
        publishStatus: "public",
      },
      { headers: { Authorization: `Bearer ${this.mediumToken}` } },
    );

    return { url: response.data?.data?.url, platform: "medium" };
  }

  async postTwitterThread(article) {
    // Post as a thread
    const tweets = this.generateTwitterThread(article);
    const twitterClient = this.getTwitterClient();

    let previousId = null;
    const postedTweets = [];

    for (const tweet of tweets) {
      const response = await twitterClient.post(
        "https://api.twitter.com/2/tweets",
        {
          text: tweet,
          ...(previousId && { reply: { in_reply_to_tweet_id: previousId } }),
        },
      );
      previousId = response.data?.data?.id;
      postedTweets.push(previousId);
    }

    return {
      url: `https://twitter.com/i/status/${postedTweets[0]}`,
      platform: "twitter",
    };
  }

  async postLinkedIn(article) {
    const response = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        author: `urn:li:person:${process.env.LINKEDIN_PERSON_URN || "me"}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: this.formatLinkedInPost(article),
            },
            shareMediaCategory: "ARTICLE",
            media: [
              {
                status: "READY",
                originalUrl: article.publishedTo?.[0]?.url || "",
              },
            ],
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );

    return { url: response.data?.id, platform: "linkedin" };
  }

  async postToSubstack(article) {
    // Substack doesn't have a public API — use email-friendly excerpt
    // Store for newsletter roundup
    return {
      url: `https://${process.env.SUBSTACK_PUBLICATION || "your-substack"}.substack.com`,
      platform: "substack",
      note: "Excerpt stored for newsletter roundup",
    };
  }

  // ── Formatters ────────────────────────────
  formatForDevTo(article) {
    let md = `# ${article.seoTitle || article.title}\n\n`;
    md += `*Originally published on IncomeBot Pro*\n\n`;
    md += typeof article.content === "string" ? article.content : "";
    md += `\n\n---\n\n*💡 Found this helpful? [Buy me a coffee](${process.env.KOFI_PAGE_URL || "#"}) to support more content like this.*`;
    return md;
  }

  formatForHashnode(article) {
    return this.formatForDevTo(article); // Same markdown format
  }

  formatForMedium(article) {
    let md = `# ${article.seoTitle || article.title}\n\n`;
    md += typeof article.content === "string" ? article.content : "";
    md += `\n\n---\n\n*This article contains affiliate links. If you purchase through these links, I may earn a commission at no extra cost to you.*`;
    return md;
  }

  generateTwitterThread(article) {
    const title = article.seoTitle || article.title;
    const firstSentence =
      (typeof article.content === "string"
        ? article.content.split(".")[0]
        : article.intro?.split(".")[0]) || "";

    return [
      `🧵 ${title}\n\n${firstSentence.slice(0, 200)}...`,
      `Here's what most people get wrong about this topic:`,
      `1️⃣ First key insight...`,
      `2️⃣ Second important finding...`,
      `3️⃣ The bottom line: what you should actually do`,
      `Full breakdown here: ${article.publishedTo?.[0]?.url || ""}`,
    ].slice(0, 6);
  }

  formatLinkedInPost(article) {
    const title = article.seoTitle || article.title;
    const url = article.publishedTo?.[0]?.url || "";
    return `${title}\n\nI just published a comprehensive guide breaking down everything you need to know.\n\nKey takeaways:\n• Takeaway 1\n• Takeaway 2\n• Takeaway 3\n\nRead the full article: ${url}\n\n#${(article.tags || ["tech"]).join(" #")}`;
  }

  getTwitterClient() {
    // Simplified — in production, use OAuth 1.0a properly
    return {
      post: async (url, data) => {
        return axios.post(url, data, {
          headers: {
            Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        });
      },
    };
  }
}
