import Anthropic from "@anthropic-ai/sdk";

export class CriticAgent {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async reviewAndImprove(draft) {
    // First, score the draft
    const evaluation = await this.evaluate(draft);

    let finalDraft = draft;
    let improvements = [];

    // If weak sections found, rewrite them
    if (evaluation.weakSections && evaluation.weakSections.length > 0) {
      for (const weakSection of evaluation.weakSections) {
        const rewritten = await this.rewriteSection(weakSection, draft);
        finalDraft = this.applyRewrite(finalDraft, weakSection, rewritten);
        improvements.push({ section: weakSection, action: "rewritten" });
      }
    }

    return {
      qualityScore: evaluation.overallScore,
      finalDraft: finalDraft,
      improvements: improvements,
      feedback: evaluation.feedback,
    };
  }

  async evaluate(draft) {
    const articleText = this.draftToText(draft);

    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 600,
      system: `You are a strict content quality evaluator. Score articles on a 0-1 scale.
      
Quality criteria:
- Originality: Does it offer unique insights or just rehash common knowledge?
- Readability: Is it easy to scan? Good paragraph length?
- Authority: Does it sound like an expert wrote it?
- Usefulness: Will the reader walk away with actionable information?
- Engagement: Does it hold attention? Is it boring?
- Commercial intent balance: Are product mentions natural, not pushy?

Be harsh but fair. A score of 0.75+ means publishable. Below 0.6 needs significant revision.`,
      messages: [
        {
          role: "user",
          content: `Evaluate this article draft and return JSON:

{
  "overallScore": 0.0-1.0,
  "criteriaScores": {
    "originality": 0.0-1.0,
    "readability": 0.0-1.0,
    "authority": 0.0-1.0,
    "usefulness": 0.0-1.0,
    "engagement": 0.0-1.0,
    "commercialBalance": 0.0-1.0
  },
  "weakSections": ["section headings that need improvement"],
  "strongSections": ["section headings that are particularly good"],
  "feedback": "brief overall assessment"
}

Article:
Title: ${draft.title}
Intro: ${draft.intro?.slice(0, 300)}...
${draft.sections?.map((s) => `${s.heading}: ${s.content?.slice(0, 200)}...`).join("\n")}`,
        },
      ],
    });

    try {
      const text = response.content[0].text;
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}") + 1;
      return JSON.parse(text.slice(jsonStart, jsonEnd));
    } catch (e) {
      return {
        overallScore: 0.7,
        weakSections: [],
        strongSections: [],
        feedback: "Could not evaluate",
      };
    }
  }

  async rewriteSection(sectionHeading, draft) {
    const section = draft.sections.find((s) => s.heading === sectionHeading);
    if (!section) return null;

    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 800,
      system:
        "Rewrite content to be more engaging, specific, and authoritative. Add concrete examples or data where possible.",
      messages: [
        {
          role: "user",
          content: `Rewrite this section to be significantly better. Make it more specific, add concrete value, and improve readability.

Section heading: ${sectionHeading}
Current content: ${section.content}

Rewrite the entire section. Make it stronger.`,
        },
      ],
    });
    return response.content[0].text;
  }

  applyRewrite(draft, sectionHeading, newContent) {
    const index = draft.sections.findIndex((s) => s.heading === sectionHeading);
    if (index >= 0 && newContent) {
      draft.sections[index].content = newContent;
      draft.sections[index].rewritten = true;
    }
    return draft;
  }

  draftToText(draft) {
    let text = `${draft.title}\n\n${draft.intro}\n\n`;
    for (const section of draft.sections) {
      text += `## ${section.heading}\n${section.content}\n\n`;
      if (section.subsections) {
        for (const sub of section.subsections) {
          text += `### ${sub.heading}\n${sub.content}\n\n`;
        }
      }
    }
    text += `\n${draft.conclusion}`;
    return text;
  }
}
