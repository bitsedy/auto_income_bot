import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SPEND_FILE = join(process.cwd(), 'data', 'daily-spend.json');

export class CostControl {
  constructor(dailyBudget = 0.50) {
    this.dailyBudget = dailyBudget;
    this.today = new Date().toISOString().slice(0, 10);
    this.spendData = this.loadSpendData();
  }

  loadSpendData() {
    if (existsSync(SPEND_FILE)) {
      const data = JSON.parse(readFileSync(SPEND_FILE, 'utf-8'));
      // Reset if new day
      if (data.date !== this.today) {
        return { date: this.today, spend: 0, breakdown: {} };
      }
      return data;
    }
    return { date: this.today, spend: 0, breakdown: {} };
  }

  saveSpendData() {
    writeFileSync(SPEND_FILE, JSON.stringify(this.spendData, null, 2));
  }

  trackSpend(model, estimatedCost) {
    // Claude Haiku: ~$0.001/1K tokens, Sonnet: ~$0.003/1K tokens
    // Our estimates per operation
    const costs = {
      'haiku': 0.0008,
      'sonnet': 0.003,
      'gpt-4o-mini': 0.0006,
      'gpt-4o': 0.006
    };

    const cost = estimatedCost || costs[model] || 0.001;
    this.spendData.spend += cost;
    
    if (!this.spendData.breakdown[model]) {
      this.spendData.breakdown[model] = 0;
    }
    this.spendData.breakdown[model] += cost;
    
    this.saveSpendData();
  }

  getTodaySpend() {
    return this.spendData.spend;
  }

  isOverBudget() {
    return this.spendData.spend >= this.dailyBudget;
  }

  getBudgetRemaining() {
    return Math.max(0, this.dailyBudget - this.spendData.spend);
  }
}