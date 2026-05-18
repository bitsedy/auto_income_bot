import axios from "axios";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GumroadEngine {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.gumroadToken = process.env.GUMROAD_ACCESS_TOKEN;
    this.api = axios.create({
      baseURL: "https://api.gumroad.com/v2",
      headers: { Authorization: `Bearer ${this.gumroadToken}` },
    });
  }

  async createProduct(stats) {
    // 1. Determine product type and generate content
    const productType = this.selectProductType(stats);
    const product = await this.generateProductContent(productType, stats);

    // 2. Create the product draft on Gumroad
    console.log(`   📦 Creating Gumroad draft: "${product.name}"`);
    let gumroadProduct;
    try {
      gumroadProduct = await this.createDraft(product);
      console.log(`   ✅ Draft created with ID: ${gumroadProduct.id}`);
    } catch (error) {
      console.error(`   ❌ Failed to create draft: ${error.message}`);
      return null;
    }

    // 3. Generate the actual file content (text) and upload it
    const filePath = await this.saveProductFile(
      product.fileContent,
      productType,
    );
    try {
      console.log(`   📤 Uploading file...`);
      await this.uploadFile(gumroadProduct.id, filePath);
      console.log(`   ✅ File uploaded.`);
    } catch (error) {
      console.error(`   ❌ File upload failed: ${error.message}`);
      // Clean up temp file even on error
      await this.deleteTempFile(filePath);
      return null;
    }

    // 4. Publish the product
    try {
      console.log(`   🚀 Publishing product...`);
      const liveProduct = await this.publishProduct(gumroadProduct.id);
      console.log(`   ✅ Product is LIVE at: ${liveProduct.short_url}`);
    } catch (error) {
      console.error(`   ❌ Publish failed: ${error.message}`);
      // If publish fails, we still return draft info; user can manually publish
    }

    // Clean up the temporary file
    await this.deleteTempFile(filePath);

    // Return product info for the stats
    return {
      id: gumroadProduct.id,
      name: product.name,
      type: productType.type,
      price: product.price,
      description: product.description,
      gumroadUrl: liveProduct ? liveProduct.short_url : null,
      createdAt: new Date().toISOString(),
      sales: 0,
      earnings: 0,
    };
  }

  // ── Internal helpers ─────────────────────

  selectProductType(stats) {
    const types = [
      { type: "prompt-pack", fileExt: ".pdf", priceRange: [5, 15] },
      { type: "notion-template", fileExt: ".zip", priceRange: [7, 19] },
      { type: "cheatsheet", fileExt: ".pdf", priceRange: [3, 9] },
      { type: "mini-ebook", fileExt: ".pdf", priceRange: [9, 29] },
    ];
    return types[Math.floor(Math.random() * types.length)];
  }

  async generateProductContent(productType, stats) {
    const priceRange = productType.priceRange;
    const price = Math.floor(
      priceRange[0] + Math.random() * (priceRange[1] - priceRange[0]),
    );

    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 800,
      system:
        "Generate digital product descriptions that sell. Focus on benefits, not features. Use scarcity and social proof elements.",
      messages: [
        {
          role: "user",
          content: `Create a ${productType.type} digital product.
Type: ${productType.type}
Price: $${price}
Target audience: People interested in ${
            Object.keys(stats.topNicheCategories || {})
              .slice(0, 3)
              .join(", ") || "productivity and tech"
          }

Return JSON:
{
  "name": "Product name (catchy, benefit-focused)",
  "description": "Compelling product description (2-3 paragraphs with benefits)",
  "fileContent": "The actual content of the digital product (plain text, Markdown, or HTML)",
  "tags": ["tag1", "tag2", "tag3"]
}`,
        },
      ],
    });

    try {
      const text = response.content[0].text;
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}") + 1;
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd));
      return { ...parsed, price, type: productType.type };
    } catch (e) {
      return {
        name: `Ultimate ${productType.type.replace("-", " ")} Pack`,
        description: `A comprehensive ${productType.type} to boost your productivity and results.`,
        fileContent: `# Sample ${productType.type} content`,
        tags: ["productivity", "digital-download"],
        price,
        type: productType.type,
      };
    }
  }

  async createDraft(product) {
    const form = new URLSearchParams();
    form.append("name", product.name);
    form.append("description", product.description);
    form.append("price", product.price * 100); // Gumroad uses cents
    form.append(
      "native_type",
      product.type === "mini-ebook" ? "ebook" : "digital",
    );
    form.append("published", "false");

    const response = await this.api.post("/products", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data.product;
  }

  async saveProductFile(content, productType) {
    // Decide filename and extension
    let ext = ".pdf";
    if (productType.fileExt) ext = productType.fileExt;
    const fileName = `product-${Date.now()}${ext}`;
    const tempDir = path.join(__dirname, "..", "..", "temp");
    if (!existsSync(tempDir)) await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, fileName);

    // For simplicity, we write the content as a text file with .pdf extension
    // In a real scenario you would generate an actual PDF. Here it's a placeholder.
    // Gumroad will still display it; the content is just the text.
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  async uploadFile(productId, filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const fileName = path.basename(filePath);
    const fileStream = await fs.open(filePath, "r");
    const fileReadStream = fileStream.createReadStream();

    // Use form-data library (must be installed: npm install form-data)
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", fileReadStream, fileName);

    await this.api.post(`/products/${productId}/product_files`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Close the file handle after upload
    await fileReadStream.close();
  }

  async publishProduct(productId) {
    const response = await this.api.put(`/products/${productId}`, {
      published: true,
    });
    return response.data.product;
  }

  async deleteTempFile(filePath) {
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
    } catch (err) {
      console.error(`   ⚠️ Failed to delete temp file: ${err.message}`);
    }
  }
}
