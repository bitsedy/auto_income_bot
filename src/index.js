import "dotenv/config";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { TrendScraper } from "./intelligence/trendScraper.js";
import { TopicScorer } from "./intelligence/topicScorer.js";
import { OutlineAgent } from "./writing/outlineAgent.js";
import { WritingAgent } from "./writing/writingAgent.js";
import { CriticAgent } from "./writing/criticAgent.js";
import { SeoAgent } from "./writing/seoAgent.js";
import { LinkInjector } from "./affiliate/linkInjector.js";
import { ProductTableBuilder } from "./affiliate/productTableBuilder.js";
import { MultiPlatformPublisher } from "./publishing/index.js";
import { GumroadEngine } from "./products/gumroadEngine.js";
import { LinkTracker } from "./analytics/linkTracker.js";
import { StatsAggregator } from "./analytics/statsAggregator.js";
import { SelfOptimizer } from "./analytics/selfOptimizer.js";
import { WeeklySummary } from "./email/weeklySummary.js";
import { CostControl } from "./core/costControl.js";
import { ResilienceManager } from "./core/resilience.js";
import { CircuitBreaker } from "./core/resilience.js";
import { installSecretSanitizer } from "./security/secretSanitizer.js";
import { checkKillSwitch } from "./security/killSwitch.js";
import { sanitizeTopics } from "./security/inputCleaner.js";
import { moderateArticle } from "./security/outputGuard.js";
import { checkAnomalies } from "./security/anomalyWatch.js";
import { checkRateLimit } from "./security/rateLimiter.js";

const DATA_DIR = join(process.cwd(), "data");
const STATS_FILE = join(DATA_DIR, "stats.json");
const TOPICS_CACHE = join(DATA_DIR, "topics-cache.json");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

class IncomeBotPro {
  constructor() {
    this.costControl = new CostControl(
      parseFloat(process.env.MAX_DAILY_API_SPEND_USD) || 0.5,
    );
    this.resilience = new ResilienceManager();
    this.stats = this.loadStats();
    this.startTime = Date.now();
    this.runId = `${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
  }

  loadStats() {
    if (existsSync(STATS_FILE)) {
      return JSON.parse(readFileSync(STATS_FILE, "utf-8"));
    }
    return {
      started: new Date().toISOString(),
      totalArticles: 0,
      totalProducts: 0,
      totalClicks: 0,
      estimatedEarnings: {
        affiliate: 0,
        medium: 0,
        gumroad: 0,
        kofi: 0,
        total: 0,
      },
      articles: [],
      products: [],
      dailyRuns: [],
      topicWeights: {
        commercialIntent: 0.35,
        searchVolume: 0.25,
        affiliateAvailability: 0.2,
        contentSaturation: -0.15,
        trendMomentum: 0.15,
      },
      topNicheCategories: {},
      circuitBreakerState: {},
    };
  }

  saveStats() {
    writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2));
  }

  log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    console.log(`${prefix} ${message}`);
  }

  async runAll() {
    // Security: sanitize secrets in output & check kill switch
    installSecretSanitizer();
    checkKillSwitch();

    this.log(`🚀 Income Bot Pro starting — Run ID: ${this.runId}`);
    this.log(
      `💰 Daily API budget: $${this.costControl.dailyBudget.toFixed(2)}`,
    );

    try {
      // Phase 1: Intelligence Gathering
      await this.gatherIntelligence();

      // Phase 2: Content Creation
      const articles = await this.createContent();

      // Phase 3: Publishing
      await this.publishContent(articles);

      // Phase 4: Digital Products (every 7th run)
      if (this.stats.dailyRuns.length % 7 === 6) {
        await this.generateProducts();
      }

      // Phase 5: Analytics & Optimization (weekly)
      if (this.stats.dailyRuns.length % 7 === 6) {
        await this.runAnalytics();
        await this.sendWeeklyReport();
      }

      // Record the run
      this.stats.dailyRuns.push({
        runId: this.runId,
        date: new Date().toISOString(),
        articlesCreated: articles.length,
        apiSpend: this.costControl.getTodaySpend(),
        duration: Date.now() - this.startTime,
      });
      this.saveStats();

      this.log(
        `✅ Run complete — ${articles.length} articles, $${this.costControl.getTodaySpend().toFixed(4)} spent`,
      );
      this.log(
        `📊 Cumulative estimated earnings: $${this.stats.estimatedEarnings.total.toFixed(2)}`,
      );
    } catch (error) {
      this.log(`❌ Fatal error: ${error.message}`, "ERROR");
      console.error(error);
    }
  }

  async gatherIntelligence() {
    this.log("🔍 Phase 1: Gathering intelligence...");

    const scraper = new TrendScraper();
    const scorer = new TopicScorer(
      this.stats.topicWeights,
      this.stats.topNicheCategories,
    );

    // Scrape multiple sources in parallel
    const [googleTrends, redditTrends, hnTrends, productHuntTrends] =
      await Promise.allSettled([
        scraper.getGoogleTrends(),
        scraper.getRedditTrends(),
        scraper.getHackerNewsTrends(),
        scraper.getProductHuntTrends(),
      ]);

    const allTopics = [
      ...(googleTrends.status === "fulfilled" ? googleTrends.value : []),
      ...(redditTrends.status === "fulfilled" ? redditTrends.value : []),
      ...(hnTrends.status === "fulfilled" ? hnTrends.value : []),
      ...(productHuntTrends.status === "fulfilled"
        ? productHuntTrends.value
        : []),
    ];

    // Security: filter out banned/scam topics
    const safeTopics = sanitizeTopics(allTopics);

    // Deduplicate and score
    const scoredTopics = scorer.scoreAndRank(safeTopics);

    // Load cache to avoid repeats
    const cache = existsSync(TOPICS_CACHE)
      ? JSON.parse(readFileSync(TOPICS_CACHE, "utf-8"))
      : { topics: [] };

    const cachedSlugs = new Set(cache.topics.map((t) => t.slug));
    const freshTopics = scoredTopics.filter((t) => !cachedSlugs.has(t.slug));

    this.log(
      `   Found ${allTopics.length} raw topics → ${scoredTopics.length} scored → ${freshTopics.length} fresh`,
    );

    // Update cache
    cache.topics = [
      ...scoredTopics
        .slice(0, 50)
        .map((t) => ({ slug: t.slug, date: new Date().toISOString() })),
      ...cache.topics,
    ].slice(0, 200);
    writeFileSync(TOPICS_CACHE, JSON.stringify(cache, null, 2));

    this.topTopics = freshTopics.slice(
      0,
      parseInt(process.env.MAX_ARTICLES_PER_RUN) || 3,
    );
    this.log(
      `   🎯 Selected top ${this.topTopics.length} topics for article generation`,
    );

    if (this.topTopics.length > 0) {
      this.topTopics.forEach((t, i) =>
        this.log(
          `      ${i + 1}. "${t.title}" (score: ${t.score.toFixed(3)}, intent: ${t.commercialIntent})`,
        ),
      );
    }
  }

  async createContent() {
    this.log("✍️ Phase 2: Creating content...");
    const articles = [];

    if (this.topTopics.length === 0) {
      this.log("   No topics to process. Skipping content creation.");
      return articles;
    }

    const outlineAgent = new OutlineAgent();
    const writingAgent = new WritingAgent();
    const criticAgent = new CriticAgent();
    const seoAgent = new SeoAgent();
    const linkInjector = new LinkInjector();
    const tableBuilder = new ProductTableBuilder();

    for (const topic of this.topTopics) {
      if (this.costControl.isOverBudget()) {
        this.log("   ⚠️ Budget cap reached. Stopping article generation.");
        break;
      }

      this.log(`   📝 Writing article for: "${topic.title}"`);

      try {
        // Stage 1: Create SEO outline (Haiku — cheap)
        const outline = await this.resilience.withRetry(
          () => outlineAgent.generateOutline(topic),
          "outline-generation",
        );
        this.costControl.trackSpend("haiku", 0.001);

        // Stage 2: Write each section (Haiku — cheap)
        const draft = await this.resilience.withRetry(
          () => writingAgent.writeSections(outline, topic),
          "section-writing",
        );
        this.costControl.trackSpend("haiku", 0.003);

        // Stage 3: Critic review & rewrite weak sections (Sonnet — quality gate)
        const review = await this.resilience.withRetry(
          () => criticAgent.reviewAndImprove(draft),
          "critic-review",
        );
        this.costControl.trackSpend("sonnet", 0.002);

        // Stage 4: SEO optimization (Haiku)
        const optimized = await this.resilience.withRetry(
          () => seoAgent.optimize(review.finalDraft, topic),
          "seo-optimization",
        );
        this.costControl.trackSpend("haiku", 0.001);

        // Quality gate
        const qualityThreshold = parseFloat(
          process.env.QUALITY_THRESHOLD || 0.75,
        );
        if (review.qualityScore < qualityThreshold) {
          this.log(
            `      ⚠️ Quality score ${review.qualityScore.toFixed(2)} below threshold. Skipping.`,
          );
          continue;
        }

        // Security: moderate content before publishing
        const isSafe = await moderateArticle({
          ...optimized,
          content: optimized.content || optimized.intro || "",
        });
        if (!isSafe) {
          this.log(`      🛡️ Article blocked by content moderation. Skipping.`);
          continue;
        }

        // Inject affiliate links & build product tables
        const withAffiliates = await linkInjector.injectLinks(optimized, topic);
        const withTables = await tableBuilder.addComparisonTable(
          withAffiliates,
          topic,
        );

        const article = {
          id: crypto.randomUUID(),
          topic: topic.title,
          slug: topic.slug,
          title: optimized.seoTitle,
          metaDescription: optimized.metaDescription,
          content: withTables,
          tags: topic.tags || [],
          affiliateLinks: withAffiliates.affiliateLinks || [],
          qualityScore: review.qualityScore,
          createdAt: new Date().toISOString(),
          publishedTo: [],
          clicks: 0,
          estimatedEarnings: 0,
        };

        articles.push(article);
        this.stats.totalArticles++;
        this.stats.articles.push(article);

        this.log(
          `      ✅ Article complete — Quality: ${review.qualityScore.toFixed(2)}, Words: ${optimized.wordCount}`,
        );
      } catch (error) {
        this.log(
          `      ❌ Failed to create article for "${topic.title}": ${error.message}`,
          "ERROR",
        );
      }
    }

    this.saveStats();
    return articles;
  }

  async publishContent(articles) {
    // Security: halt on abnormal behavior
    checkAnomalies(articles, this.stats);

    this.log("📤 Phase 3: Publishing content...");

    if (articles.length === 0) {
      this.log("   No articles to publish.");
      return;
    }

    const publisher = new MultiPlatformPublisher();
    const linkTracker = new LinkTracker();

    for (const article of articles) {
      this.log(`   🚀 Publishing: "${article.title}"`);

      // Create tracked short links for all affiliate URLs
      const trackedArticle = await linkTracker.createTrackedLinks(article);

      // Publish to all platforms with circuit breaker & rate limit protection
      const platforms = [
        {
          name: "Dev.to",
          publish: () => publisher.publishToDevTo(trackedArticle),
        },
        {
          name: "Hashnode",
          publish: () => publisher.publishToHashnode(trackedArticle),
        },
        {
          name: "Medium",
          publish: () => publisher.publishToMedium(trackedArticle),
        },
        {
          name: "Twitter/X",
          publish: () => publisher.postTwitterThread(trackedArticle),
        },
        {
          name: "LinkedIn",
          publish: () => publisher.postLinkedIn(trackedArticle),
        },
        {
          name: "Substack",
          publish: () => publisher.postToSubstack(trackedArticle),
        },
      ];

      for (const platform of platforms) {
        // Circuit breaker
        if (CircuitBreaker.isOpen(platform.name)) {
          this.log(`      ⚠️ ${platform.name} circuit breaker open — skipping`);
          continue;
        }

        // Rate limiter
        if (!checkRateLimit(platform.name)) {
          continue;
        }

        try {
          const result = await this.resilience.withRetry(
            () => platform.publish(),
            `publish-${platform.name.toLowerCase()}`,
          );
          article.publishedTo.push({
            platform: platform.name,
            url: result.url,
            date: new Date().toISOString(),
          });
          this.log(`      ✅ Published to ${platform.name}`);
        } catch (error) {
          this.log(
            `      ❌ ${platform.name} failed: ${error.message}`,
            "WARN",
          );
          CircuitBreaker.recordFailure(platform.name);
        }
      }
    }

    this.saveStats();
  }

  async generateProducts() {
    this.log("🎁 Phase 4: Generating digital products...");
    const engine = new GumroadEngine();

    try {
      const product = await engine.createProduct(this.stats);
      if (product) {
        this.stats.totalProducts++;
        this.stats.products.push(product);
        this.log(
          `   ✅ Product created: "${product.name}" — $${product.price}`,
        );
        this.saveStats();
      }
    } catch (error) {
      this.log(`   ❌ Product generation failed: ${error.message}`, "ERROR");
    }
  }

  async runAnalytics() {
    this.log("📊 Phase 5: Running analytics & self-optimization...");

    const aggregator = new StatsAggregator();
    const optimizer = new SelfOptimizer(this.stats);

    try {
      // Aggregate cross-platform stats
      const analytics = await aggregator.gatherAllStats(this.stats.articles);

      // Update estimated earnings
      this.stats.estimatedEarnings = analytics.earnings;

      // Self-optimize topic weights
      const newWeights = optimizer.optimizeWeights(analytics);
      this.stats.topicWeights = newWeights;

      // Update top niche categories
      this.stats.topNicheCategories = optimizer.extractTopNiches(analytics);

      this.log(`   📈 New topic weights: ${JSON.stringify(newWeights)}`);
      this.log(
        `   💰 Updated earnings estimate: $${analytics.earnings.total.toFixed(2)}`,
      );
      this.log(
        `   🎯 Top niches: ${JSON.stringify(this.stats.topNicheCategories)}`,
      );

      this.saveStats();

      // Generate dashboard
      const { generateDashboard } =
        await import("./dashboard/generateDashboard.js");
      await generateDashboard(this.stats);
    } catch (error) {
      this.log(`   ❌ Analytics failed: ${error.message}`, "ERROR");
    }
  }

  async sendWeeklyReport() {
    this.log("📧 Sending weekly summary email...");
    try {
      const summary = new WeeklySummary(this.stats);
      await summary.send();
      this.log("   ✅ Weekly report sent");
    } catch (error) {
      this.log(`   ❌ Email failed: ${error.message}`, "ERROR");
    }
  }
}

// ── Entry point ──────────────────────────────
const bot = new IncomeBotPro();
bot
  .runAll()
  .then(() => {
    console.log("\n✨ Income Bot Pro finished. Next run: tomorrow at 9am UTC.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
