// Monitors run stats and stops the bot if abnormal patterns detected.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const STATE_DIR = join(process.cwd(), "data");
const ANOMALY_FILE = join(STATE_DIR, "anomaly-state.json");

function loadState() {
  if (existsSync(ANOMALY_FILE))
    return JSON.parse(readFileSync(ANOMALY_FILE, "utf-8"));
  return { dailyArticleCounts: {}, totalRuns: 0 };
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(ANOMALY_FILE, JSON.stringify(state, null, 2));
}

export function checkAnomalies(articlesThisRun, stats) {
  const state = loadState();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Sudden spike: more than 10 articles in one day
  if (articlesThisRun.length > 10) {
    throw new Error(
      `ANOMALY: Attempted to publish ${articlesThisRun.length} articles (limit 10). Killed.`,
    );
  }

  // 2. Count articles created today (including previous runs)
  state.dailyArticleCounts[today] =
    (state.dailyArticleCounts[today] || 0) + articlesThisRun.length;
  if (state.dailyArticleCounts[today] > 20) {
    throw new Error(
      `ANOMALY: ${state.dailyArticleCounts[today]} articles today (limit 20). Killed.`,
    );
  }

  // 3. Duplicate titles in recent runs (bot loop)
  const last50Titles = stats.articles
    .slice(-50)
    .map((a) => a.title || a.topic)
    .filter(Boolean);
  const uniqueTitles = new Set(last50Titles);
  if (
    last50Titles.length > 10 &&
    uniqueTitles.size < last50Titles.length * 0.3
  ) {
    throw new Error(
      "ANOMALY: >70% duplicate titles detected. Possible loop. Killed.",
    );
  }

  // 4. Failure rate spike (if >80% of last 10 runs failed)
  const recentRuns = stats.dailyRuns.slice(-10);
  if (
    recentRuns.length === 10 &&
    recentRuns.every((r) => r.articlesCreated === 0)
  ) {
    throw new Error(
      "ANOMALY: All 10 most recent runs produced zero articles. Killed.",
    );
  }

  saveState(state);
}
