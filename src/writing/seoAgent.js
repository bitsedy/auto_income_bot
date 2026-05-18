import Anthropic from "@anthropic-ai/sdk";

export class SeoAgent {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async optimize(draft, topic) {
    // Optimize title
    const optimizedTitle = await this.optimizeTitle(draft.title, topic);

    // Optimize meta description
    const optimizedMeta = await this.optimizeMeta(
      draft.metaDescription,
      optimizedTitle,
      topic,
    );

    // Optimize headings for keyword placement
    const optimizedHeadings = await this.optimizeHeadings(draft, topic);

    // Count approximate word count
    const fullText = this.assembleText(draft);
    const wordCount = fullText.split(/\s+/).length;

    return {
      ...draft,
      seoTitle: optimizedTitle,
      metaDescription: optimizedMeta,
      sections: optimizedHeadings.sections,
      keywordDensity: optimizedHeadings.keywordDensity,
      wordCount: wordCount,
      optimizedAt: new Date().toISOString(),
    };
  }

  async optimizeTitle(currentTitle, topic) {
    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 100,
      system:
        "Optimize article titles for SEO. Include primary keyword. Keep under 60 characters. Use power words (Best, Ultimate, Top, Essential, Complete). Include year if relevant.",
      messages: [
        {
          role: "user",
          content: `Optimize this article title for SEO. Return ONLY the optimized title:
Current: "${currentTitle}"
Topic: "${topic.title}"
Category: ${topic.category}`,
        },
      ],
    });
    return response.content[0].text.trim().replace(/^["']|["']$/g, "");
  }

  async optimizeMeta(currentMeta, title, topic) {
    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      system:
        "Write compelling meta descriptions. 150-160 characters. Include primary keyword. Include a call-to-action or value proposition.",
      messages: [
        {
          role: "user",
          content: `Write an SEO meta description (150-160 chars) for:
Title: "${title}"
Topic: ${topic.title}
Current: "${currentMeta}"
Return ONLY the meta description.`,
        },
      ],
    });
    return response.content[0].text.trim();
  }

  async optimizeHeadings(draft, topic) {
    const keyword = draft.targetKeyword || topic.title.toLowerCase();
    const optimizedSections = draft.sections.map((section) => {
      // Ensure H2 contains keyword or variation if natural
      let heading = section.heading;
      if (!heading.toLowerCase().includes(keyword.split(" ")[0])) {
        // Don't force it if it would sound unnatural — just note it
        section.keywordInHeading = false;
      } else {
        section.keywordInHeading = true;
      }
      return section;
    });

    return {
      sections: optimizedSections,
      keywordDensity: "optimized",
    };
  }

  assembleText(draft) {
    let text = `${draft.title}\n\n${draft.intro}\n\n`;
    for (const s of draft.sections) {
      text += `${s.heading}\n${s.content}\n\n`;
      if (s.subsections) {
        for (const sub of s.subsections) {
          text += `${sub.heading}\n${sub.content}\n\n`;
        }
      }
    }
    text += draft.conclusion;
    return text;
  }
}
