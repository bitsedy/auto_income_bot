import axios from "axios";
import { parseStringPromise } from "xml2js";
import RssParser from "rss-parser";

export class TrendScraper {
  constructor() {
    this.rssParser = new RssParser();
  }

  async getGoogleTrends() {
    try {
      // Google Trends RSS feed
      const response = await axios.get(
        "https://trends.google.com/trending/rss?geo=US",
        {
          timeout: 15000,
        },
      );
      const feed = await this.rssParser.parseString(response.data);
      return feed.items.slice(0, 15).map((item) => ({
        title: item.title,
        source: "google-trends",
        url: item.link,
        pubDate: item.pubDate,
        rawVolume: item["ht:approx_traffic"] || "medium",
        category: this.inferCategory(item.title),
      }));
    } catch (error) {
      console.log(`      Google Trends scrape failed: ${error.message}`);
      return [];
    }
  }

  async getRedditTrends() {
    try {
      // Reddit r/all JSON (no auth needed)
      const subreddits = [
        "technology",
        "gadgets",
        "Frugal",
        "BuyItForLife",
        "productivity",
      ];
      const results = [];

      for (const sub of subreddits.slice(0, 3)) {
        const response = await axios.get(
          `https://www.reddit.com/r/${sub}/hot.json?limit=10`,
          { headers: { "User-Agent": "IncomeBotPro/2.0" }, timeout: 15000 },
        );
        const posts = response.data?.data?.children || [];
        for (const post of posts) {
          const data = post.data;
          if (data.ups > 100) {
            results.push({
              title: data.title,
              source: `reddit-r/${sub}`,
              url: `https://reddit.com${data.permalink}`,
              score: data.ups,
              numComments: data.num_comments,
              category: this.inferCategory(
                data.title + " " + (data.selftext || ""),
              ),
            });
          }
        }
      }
      return results;
    } catch (error) {
      console.log(`      Reddit scrape failed: ${error.message}`);
      return [];
    }
  }

  async getHackerNewsTrends() {
    try {
      const response = await axios.get(
        "https://hacker-news.firebaseio.com/v0/topstories.json",
        { timeout: 10000 },
      );
      const ids = response.data.slice(0, 30);

      const stories = await Promise.allSettled(
        ids.map((id) =>
          axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            timeout: 5000,
          }),
        ),
      );

      return stories
        .filter((s) => s.status === "fulfilled" && s.value.data)
        .map((s) => s.value.data)
        .filter((story) => story.score > 50)
        .map((story) => ({
          title: story.title,
          source: "hacker-news",
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          score: story.score,
          numComments: story.descendants || 0,
          category: this.inferCategory(story.title),
        }));
    } catch (error) {
      console.log(`      HackerNews scrape failed: ${error.message}`);
      return [];
    }
  }

  async getProductHuntTrends() {
    try {
      // Product Hunt has a public GraphQL endpoint
      const response = await axios
        .post(
          "https://api.producthunt.com/v2/api/graphql",
          {
            query: `{
            posts(first: 20, order: RANKING) {
              edges {
                node {
                  name
                  tagline
                  url
                  votesCount
                  commentsCount
                  topics { edges { node { name } } }
                }
              }
            }
          }`,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 15000,
          },
        )
        .catch(() => ({ data: { data: { posts: { edges: [] } } } }));

      const edges = response.data?.data?.posts?.edges || [];
      return edges.map((edge) => ({
        title: `${edge.node.name}: ${edge.node.tagline}`,
        source: "product-hunt",
        url: edge.node.url,
        votesCount: edge.node.votesCount,
        category: "tech-gadgets",
        tags: edge.node.topics?.edges?.map((t) => t.node.name) || [],
      }));
    } catch (error) {
      console.log(`      ProductHunt scrape failed: ${error.message}`);
      return [];
    }
  }

  inferCategory(text) {
    const lower = text.toLowerCase();
    const categoryMap = {
      "tech-gadgets": [
        "gadget",
        "device",
        "headphone",
        "laptop",
        "monitor",
        "keyboard",
        "mouse",
        "phone",
        "watch",
        "camera",
        "speaker",
        "earbud",
      ],
      "home-office": [
        "desk",
        "chair",
        "office",
        "monitor",
        "standing",
        "ergonomic",
        "workspace",
        "remote",
      ],
      "software-reviews": [
        "app",
        "software",
        "tool",
        "saas",
        "platform",
        "extension",
        "plugin",
        "alternative",
      ],
      "developer-tools": [
        "api",
        "sdk",
        "framework",
        "library",
        "npm",
        "github",
        "code",
        "ide",
        "cli",
        "docker",
      ],
      productivity: [
        "productivity",
        "planner",
        "notion",
        "template",
        "workflow",
        "automation",
        "focus",
        "habit",
      ],
      "fitness-tech": [
        "fitness",
        "workout",
        "running",
        "gym",
        "tracker",
        "bike",
        "yoga",
      ],
      "smart-home": [
        "smart",
        "home",
        "alexa",
        "google home",
        "iot",
        "thermostat",
        "light",
        "security cam",
      ],
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return category;
      }
    }
    return "general"; 
  }
}
