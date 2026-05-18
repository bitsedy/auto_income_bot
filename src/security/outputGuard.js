// Uses Claude to verify content is safe before publishing.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SAFETY_PROMPT = `You are a strict content moderator. Review the following article and respond with a JSON object: 
{ "safe": true/false, "reason": "why if not safe" }
Flag ANY of: hate speech, violence, adult content, scams, political extremism, misinformation, or content that violates common platform ToS (spam, excessive affiliate links, non-original scraped text).`;

export async function moderateArticle(article) {
  const textSample = (
    typeof article.content === "string" ? article.content : article.intro || ""
  ).slice(0, 4000);

  try {
    const resp = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 150,
      system: SAFETY_PROMPT,
      messages: [{ role: "user", content: `Article:\n${textSample}` }],
    });

    const text = resp.content[0].text;
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}") + 1;
    const { safe, reason } = JSON.parse(text.slice(jsonStart, jsonEnd));

    if (!safe) {
      console.log(`   🛡️ Content blocked: ${reason}`);
      return false;
    }
    return true;
  } catch (err) {
    // If moderation fails, default to safe (allow with caution)
    console.log(`   ⚠️ Moderation check failed: ${err.message}. Allowing.`);
    return true;
  }
}
