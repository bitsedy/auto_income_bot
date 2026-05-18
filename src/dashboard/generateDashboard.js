import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export async function generateDashboard(stats) {
  const dashboardDir = join(process.cwd(), 'dashboard');
  if (!existsSync(dashboardDir)) mkdirSync(dashboardDir, { recursive: true });

  const recentArticles = (stats.articles || []).slice(-10).reverse();
  const earnings = stats.estimatedEarnings || { affiliate: 0, medium: 0, gumroad: 0, kofi: 0, total: 0 };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Income Bot Pro — Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #38bdf8; margin-bottom: 5px; }
    .subtitle { color: #94a3b8; margin-bottom: 30px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 30px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .card h3 { font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card .value { font-size: 2rem; font-weight: 700; color: #f8fafc; }
    .card .value.positive { color: #4ade80; }
    .chart-container { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; }
    .badge-success { background: #064e3b; color: #4ade80; }
    .badge-warning { background: #451a03; color: #fbbf24; }
    .footer { text-align: center; color: #64748b; font-size: 0.8rem; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Income Bot Pro</h1>
    <p class="subtitle">Last updated: ${new Date().toLocaleString()} · Auto-refreshes daily</p>

    <div class="grid">
      <div class="card">
        <h3>📝 Total Articles</h3>
        <div class="value">${stats.totalArticles || 0}</div>
      </div>
      <div class="card">
        <h3>💰 Est. Total Earnings</h3>
        <div class="value positive">$${earnings.total.toFixed(2)}</div>
      </div>
      <div class="card">
        <h3>🔗 Affiliate Earnings</h3>
        <div class="value">$${earnings.affiliate.toFixed(2)}</div>
      </div>
      <div class="card">
        <h3>📦 Products</h3>
        <div class="value">${stats.totalProducts || 0}</div>
      </div>
    </div>

    <div class="chart-container">
      <h3 style="margin-bottom: 15px;">📈 30-Day Earnings Breakdown</h3>
      <canvas id="earningsChart" height="250"></canvas>
    </div>

    <div class="chart-container">
      <h3 style="margin-bottom: 15px;">📋 Recent Articles</h3>
      <table>
        <thead><tr><th>Date</th><th>Title</th><th>Quality</th><th>Published To</th></tr></thead>
        <tbody>
          ${recentArticles.map(a => `
            <tr>
              <td>${(a.createdAt || '').slice(0, 10)}</td>
              <td>${(a.title || a.topic || 'Untitled').slice(0, 60)}</td>
              <td><span class="badge ${(a.qualityScore || 0) >= 0.75 ? 'badge-success' : 'badge-warning'}">${((a.qualityScore || 0.7) * 100).toFixed(0)}%</span></td>
              <td>${(a.publishedTo || []).map(p => p.platform).join(', ') || 'Draft'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${recentArticles.length === 0 ? '<p style="text-align: center; color: #64748b; padding: 20px;">No articles yet. First run incoming!</p>' : ''}
    </div>

    <p class="footer">🤖 Income Bot Pro v2.0 · Runs daily at 9am UTC · Zero-cost autonomous operation</p>
  </div>

  <script>
    new Chart(document.getElementById('earningsChart'), {
      type: 'bar',
      data: {
        labels: ['Affiliate', 'Medium', 'Gumroad', 'Ko-fi'],
        datasets: [{
          label: 'Estimated Earnings (USD)',
          data: [${earnings.affiliate}, ${earnings.medium}, ${earnings.gumroad}, ${earnings.kofi}],
          backgroundColor: ['#4ade80', '#38bdf8', '#a78bfa', '#fb923c']
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  </script>
</body>
</html>`;

  writeFileSync(join(dashboardDir, 'index.html'), html);
  console.log('   📊 Dashboard generated: dashboard/index.html');
}