import { buildChartsScript } from "./ui-charts-js";

export function buildDashboardHtml(): string {
  const chartsScript = buildChartsScript();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solardi Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    body { background-color: #0f172a; color: #e2e8f0; }
    .nav-btn { transition: all 0.15s ease; }
    .nav-btn.active { background-color: #3b82f6; color: #fff; }
    .nav-btn:not(.active):hover { background-color: #334155; }
    .loop-modal-backdrop {
      position: fixed; inset: 0; z-index: 50;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
    }
    .loop-modal-card {
      position: relative;
      background: #1e293b; border: 1px solid #475569;
      border-radius: 0.75rem; padding: 1.5rem;
      width: 100%; max-width: 28rem;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body class="min-h-screen">
  <nav id="top-bar" class="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center gap-3 overflow-x-auto">
    <h1 class="text-lg font-bold text-white whitespace-nowrap mr-2">Solardi</h1>
    <div id="nav-buttons" class="flex gap-2"></div>
    <div class="ml-auto flex items-center gap-4 whitespace-nowrap">
      <span class="text-sm text-slate-400" id="instance-count">0 active instances</span>
      <span class="text-xs text-slate-500" id="last-updated"></span>
    </div>
  </nav>

  <div class="max-w-7xl mx-auto p-6">
    <div id="instances-container"></div>

    <div id="no-instances" class="text-center py-16 text-slate-500">
      <p class="text-lg">No data available yet.</p>
      <p class="text-sm mt-2">Run a command to generate metrics, or use <code class="text-slate-300">--report-metrics</code> for live updates.</p>
    </div>
  </div>

  <div id="loop-modal" style="display:none"></div>

  <script>
  ${chartsScript}
  </script>
</body>
</html>`;
}
