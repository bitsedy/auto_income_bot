import Anthropic from "@anthropic-ai/sdk";

export class ProductTableBuilder {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.associateTag = process.env.AMAZON_ASSOCIATE_TAG || "default-20";
  }

  async addComparisonTable(articleWithContent, topic) {
    const content =
      typeof articleWithContent === "string"
        ? articleWithContent
        : articleWithContent.content || articleWithContent.intro || "";

    // Only add table if topic has strong commercial intent
    if (topic.commercialIntent && parseFloat(topic.commercialIntent) < 0.4) {
      return content; // Skip table for low-intent topics
    }

    const table = await this.generateTable(topic);

    // Insert table after the first H2 section (or near the top)
    const h2Index = content.indexOf("## ");
    if (h2Index > 0) {
      const afterHeading = content.indexOf("\n\n", h2Index);
      if (afterHeading > 0) {
        return (
          content.slice(0, afterHeading + 2) +
          "\n" +
          table +
          "\n" +
          content.slice(afterHeading + 2)
        );
      }
    }

    // Fallback: append
    return content + "\n\n" + table;
  }

  async generateTable(topic) {
    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 600,
      system: `Create product comparison tables in Markdown. Include 3-5 products. Use realistic but generic product descriptions.
Format:
| Product | Best For | Key Feature | Price Range | Rating |
|---------|----------|-------------|-------------|--------|
| [Product A](Amazon link) | use case | key feature | $$ | ⭐4.X |
| ... | ... | ... | ... | ... |

Make products realistic for the category. Use Amazon affiliate links with tag placeholder.`,
      messages: [
        {
          role: "user",
          content: `Create a Markdown product comparison table for the topic: "${topic.title}"
Category: ${topic.category || "general"}
Include 3-5 realistic product types (not specific brands unless universally known).

Use this Amazon link format: https://www.amazon.com/s?k=PRODUCT+KEYWORD&tag=${this.associateTag}

Return ONLY the Markdown table with a brief "## Quick Comparison" heading above it.`,
        },
      ],
    });

    return response.content[0].text.trim();
  }
}
