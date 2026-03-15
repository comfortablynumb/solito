export function buildChartsScript(): string {
  return `
(function() {
${buildStateSection()}
${buildChartHelpers()}
${buildUtilityFunctions()}
${buildNavigationFunctions()}
${buildCardBuilders()}
${buildLayoutFunctions()}
${buildStatusBadgeAndSummary()}
${buildHistoryAndDelta()}
${buildMetricsUpdateHeader()}
${buildMetricsUpdateBody()}
${buildInstanceManagement()}
${buildDashboardRefresh()}
${buildModalFunctions()}
${buildTsvRefresh()}
${buildInitSection()}
})();
`;
}

function buildStateSection(): string {
  return `  var chartInstances = {};
  var knownInstances = {};
  var instanceRegistry = {};
  var selectedInstanceId = null;
  var PAGE_SIZE = 10;
  var paginationState = {};
  var CHART_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  var CARD_BGS = [
    'bg-green-900/50', 'bg-amber-900/50', 'bg-blue-900/50', 'bg-red-900/50',
    'bg-purple-900/50', 'bg-cyan-900/50', 'bg-pink-900/50', 'bg-lime-900/50'
  ];`;
}

function buildChartHelpers(): string {
  return `  function createChart(canvasId, label, color) {
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: label,
          data: [],
          borderColor: color,
          backgroundColor: color + '33',
          fill: true,
          tension: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
        },
        plugins: {
          legend: { labels: { color: '#e2e8f0' } }
        }
      }
    });

    return chartInstances[canvasId];
  }

  function updateChart(canvasId, labels, data) {
    var chart = chartInstances[canvasId];
    if (!chart) return;

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
  }

  function extractChartData(metrics, metricKey) {
    var labels = metrics.map(function(m) { return 'Loop ' + m.loop; });
    var data = metrics.map(function(m) { return (m.metrics || {})[metricKey] || 0; });
    return { labels: labels, data: data };
  }`;
}

function buildUtilityFunctions(): string {
  return `  function shortId(id) {
    return id.substring(0, 8);
  }

  function projectDirName(projectPath) {
    var sep = projectPath.indexOf('\\\\') !== -1 ? '\\\\' : '/';
    var parts = projectPath.replace(/[\\\\/]+$/, '').split(sep);
    return parts[parts.length - 1] || projectPath;
  }

  function formatLabel(key) {
    return key.replace(/_/g, ' ').replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
  }

  function discoverMetricKeys(metrics) {
    var keys = {};

    metrics.forEach(function(m) {
      var obj = m.metrics || {};

      Object.keys(obj).forEach(function(k) {
        keys[k] = true;
      });
    });

    return Object.keys(keys);
  }`;
}

function buildNavigationFunctions(): string {
  return `  function selectInstance(instanceId) {
    selectedInstanceId = instanceId;
    updateNavButtons();
    updateVisibility();
  }

  function updateNavButtons() {
    var container = document.getElementById('nav-buttons');
    if (!container) return;

    var ids = Object.keys(instanceRegistry);
    var html = '';

    html += '<button class="nav-btn px-3 py-1.5 rounded-md text-sm font-medium '
      + (selectedInstanceId === null ? 'active' : 'text-slate-300 bg-slate-800')
      + '" data-instance-id="__all__">All</button>';

    ids.forEach(function(id) {
      var info = instanceRegistry[id];
      var label = projectDirName(info.project);
      var isActive = selectedInstanceId === id;

      html += '<button class="nav-btn px-3 py-1.5 rounded-md text-sm font-medium '
        + (isActive ? 'active' : 'text-slate-300 bg-slate-800')
        + '" data-instance-id="' + id + '" title="' + info.project + ' (' + info.command + ')">'
        + label + '</button>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.getAttribute('data-instance-id');
        selectInstance(targetId === '__all__' ? null : targetId);
      });
    });
  }

  function updateVisibility() {
    Object.keys(instanceRegistry).forEach(function(id) {
      var sid = shortId(id);
      var el = document.getElementById('inst-' + sid);
      if (!el) return;

      if (selectedInstanceId === null || selectedInstanceId === id) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }`;
}

function buildCardBuilders(): string {
  return `  function buildInstanceCard(sid) {
    return '<div class="bg-slate-800 rounded-lg p-4 border border-slate-600 mb-6" id="inst-' + sid + '">' +
      '<div class="flex items-center justify-between mb-4">' +
        '<div>' +
          '<h2 class="text-xl font-bold text-white" id="inst-project-' + sid + '"></h2>' +
          '<div class="text-sm text-slate-400 mt-0.5" id="inst-title-' + sid + '"></div>' +
        '</div>' +
        '<span class="text-xs text-slate-500" id="inst-fullpath-' + sid + '"></span>' +
      '</div>' +
      '<div id="inst-cards-' + sid + '" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4"></div>' +
      '<div id="inst-charts-' + sid + '" class="grid grid-cols-1 lg:grid-cols-3 gap-4"></div>' +
      '<div class="mt-4">' +
        '<h3 class="text-sm font-semibold text-slate-300 mb-2">Loop History</h3>' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-sm text-left">' +
            '<thead class="text-xs text-slate-400 border-b border-slate-700">' +
              '<tr>' +
                '<th class="py-2 px-2">Loop</th>' +
                '<th class="py-2 px-2">Status</th>' +
                '<th class="py-2 px-2">Commit</th>' +
                '<th class="py-2 px-2">Metrics</th>' +
                '<th class="py-2 px-2">Description</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="inst-history-' + sid + '" class="text-slate-300"></tbody>' +
          '</table>' +
        '</div>' +
        '<div id="inst-pager-' + sid + '" class="flex items-center justify-between mt-2 text-xs text-slate-400"></div>' +
      '</div>' +
    '</div>';
  }

  function buildSmallCard(title, id, bg) {
    return '<div class="' + bg + ' rounded-lg p-3 border border-slate-600">' +
      '<div class="text-xs text-slate-400 mb-1">' + title + '</div>' +
      '<div class="text-xl font-bold" id="' + id + '">-</div>' +
      '<div class="text-xs mt-1 font-medium" id="' + id + '-delta"></div>' +
      '<div class="text-xs font-medium" id="' + id + '-delta-last"></div>' +
    '</div>';
  }

  function buildSmallChartCard(title, canvasId) {
    return '<div class="bg-slate-900/50 rounded-lg p-3 border border-slate-700">' +
      '<div class="text-sm text-slate-400 mb-2">' + title + '</div>' +
      '<div style="height:180px;"><canvas id="' + canvasId + '"></canvas></div>' +
    '</div>';
  }`;
}

function buildSetInstanceInfo(): string {
  return `  function setInstanceInfo(sid, inst) {
    if (!knownInstances[sid]) {
      knownInstances[sid] = { metricKeys: [] };
    }

    var projectEl = document.getElementById('inst-project-' + sid);

    if (projectEl) {
      projectEl.textContent = projectDirName(inst.project);
    }

    var titleEl = document.getElementById('inst-title-' + sid);

    if (titleEl) {
      titleEl.innerHTML = inst.command + ' <span class="text-slate-500">(' + sid + ')</span>';
    }

    var fullpathEl = document.getElementById('inst-fullpath-' + sid);

    if (fullpathEl) {
      fullpathEl.textContent = inst.project;
    }
  }`;
}

function buildEnsureStatusCards(): string {
  return `  function ensureStatusCards(sid) {
    var cardsEl = document.getElementById('inst-cards-' + sid);

    if (cardsEl) {
      var loopId = 'inst-loop-' + sid;
      var statusId = 'inst-status-' + sid;

      if (!document.getElementById(loopId)) {
        cardsEl.insertAdjacentHTML('beforeend', buildSmallCard('Loop', loopId, 'bg-purple-900/50'));
        cardsEl.insertAdjacentHTML('beforeend', buildSmallCard('Status', statusId, 'bg-slate-700/50'));
      }
    }
  }`;
}

function buildAddNewMetricKeys(): string {
  return `  function addNewMetricKeys(sid, metricKeys) {
    var existing = knownInstances[sid].metricKeys;
    var newKeys = metricKeys.filter(function(k) { return existing.indexOf(k) === -1; });

    if (newKeys.length === 0) return;

    var cardsEl = document.getElementById('inst-cards-' + sid);
    var chartsEl = document.getElementById('inst-charts-' + sid);

    newKeys.forEach(function(key) {
      var idx = existing.length;
      existing.push(key);
      var bg = CARD_BGS[idx % CARD_BGS.length];
      var color = CHART_COLORS[idx % CHART_COLORS.length];
      var label = formatLabel(key);
      var cardId = 'inst-m-' + sid + '-' + key;
      var chartId = 'chart-m-' + sid + '-' + key;

      if (cardsEl) {
        cardsEl.insertAdjacentHTML('beforeend', buildSmallCard(label, cardId, bg));
      }

      if (chartsEl) {
        chartsEl.insertAdjacentHTML('beforeend', buildSmallChartCard(label, chartId));
        createChart(chartId, label, color);
      }
    });
  }`;
}

function buildLayoutFunctions(): string {
  return [
    buildSetInstanceInfo(),
    buildEnsureStatusCards(),
    buildAddNewMetricKeys(),
    `  function ensureInstanceLayout(sid, inst, metricKeys) {
    setInstanceInfo(sid, inst);
    ensureStatusCards(sid);
    addNewMetricKeys(sid, metricKeys);
  }`,
  ].join("\n\n");
}

function buildStatusBadgeAndSummary(): string {
  return `  function statusBadge(status) {
    var colors = {
      'SUCCESS': 'bg-green-900/60 text-green-300',
      'FAIL': 'bg-red-900/60 text-red-300',
      'TIMEOUT': 'bg-amber-900/60 text-amber-300',
      'CONNECTED': 'bg-blue-900/60 text-blue-300'
    };
    var upper = (status || '').toUpperCase();
    var cls = colors[upper] || 'bg-slate-700 text-slate-300';
    return '<span class="px-1.5 py-0.5 rounded text-xs font-medium ' + cls + '">' + (status || '-') + '</span>';
  }

  function formatMetricsSummary(m) {
    if (!m || Object.keys(m).length === 0) return '<span class="text-slate-500">-</span>';

    var parts = [];

    Object.keys(m).forEach(function(key) {
      var label = key.replace(/_/g, ' ');
      parts.push('<span class="text-slate-400">' + label + ':</span> ' + m[key]);
    });

    return parts.join('<span class="text-slate-600 mx-1">|</span>');
  }`;
}

function buildHistoryAndDelta(): string {
  return [buildHistoryRows(), buildPaginationState(), buildPagerControls(), buildPagerInteraction(), buildDeltaHelpers()].join("\n\n");
}

function buildHistoryRows(): string {
  return `  function buildHistoryRows(metrics) {
    var html = '';

    for (var i = 0; i < metrics.length; i++) {
      var r = metrics[i];
      var commitText = r.commit ? '<code class="text-xs bg-slate-900 px-1 py-0.5 rounded text-cyan-300">' + r.commit + '</code>' : '<span class="text-slate-500">-</span>';

      var rowData = JSON.stringify(r).replace(/"/g, '&quot;');

      html += '<tr class="border-b border-slate-700/50 hover:bg-slate-600/40 cursor-pointer" onclick="showLoopModal(this)" data-row="' + rowData + '">' +
        '<td class="py-1.5 px-2 font-mono">' + r.loop + '</td>' +
        '<td class="py-1.5 px-2">' + statusBadge(r.status) + '</td>' +
        '<td class="py-1.5 px-2">' + commitText + '</td>' +
        '<td class="py-1.5 px-2 text-xs">' + formatMetricsSummary(r.metrics) + '</td>' +
        '<td class="py-1.5 px-2 text-xs text-slate-400 max-w-xs truncate">' + (r.description || '-') + '</td>' +
      '</tr>';
    }

    return html;
  }`;
}

function buildPaginationState(): string {
  return `  function getPage(sid) {
    return paginationState[sid] || 1;
  }

  function setPage(sid, page) {
    paginationState[sid] = page;
  }

  function paginateRows(allRows, sid) {
    var page = getPage(sid);
    var total = allRows.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (page > totalPages) {
      page = totalPages;
      setPage(sid, page);
    }

    var start = (page - 1) * PAGE_SIZE;
    return { rows: allRows.slice(start, start + PAGE_SIZE), page: page, totalPages: totalPages, total: total };
  }`;
}

function buildPagerControls(): string {
  return `  function buildPagerControls(sid, page, totalPages, total) {
    if (totalPages <= 1) return '';

    var start = (page - 1) * PAGE_SIZE + 1;
    var end = Math.min(page * PAGE_SIZE, total);

    var html = '<span>' + start + '-' + end + ' of ' + total + '</span>';
    html += '<div class="flex gap-1">';
    html += buildNavButton(sid, 1, '&laquo;', page <= 1);
    html += buildNavButton(sid, page - 1, '&lsaquo;', page <= 1);
    html += '<span class="px-2 py-1">' + page + ' / ' + totalPages + '</span>';
    html += buildNavButton(sid, page + 1, '&rsaquo;', page >= totalPages);
    html += buildNavButton(sid, totalPages, '&raquo;', page >= totalPages);
    html += '</div>';
    return html;
  }

  function buildNavButton(sid, targetPage, label, isDisabled) {
    return '<button class="pager-btn px-2 py-1 rounded bg-slate-700 hover:bg-slate-600'
      + (isDisabled ? ' opacity-40 cursor-default' : '') + '"'
      + ' data-sid="' + sid + '" data-page="' + targetPage + '"'
      + (isDisabled ? ' disabled' : '') + '>' + label + '</button>';
  }`;
}

function buildPagerInteraction(): string {
  return `  window.handlePagerClick = function(sid, page) {
    setPage(sid, page);
    var state = paginationState[sid + '_rows'];

    if (state) {
      renderHistoryPage(sid, state);
    }
  };

  function renderHistoryPage(sid, allRows) {
    paginationState[sid + '_rows'] = allRows;
    var result = paginateRows(allRows, sid);
    var historyEl = document.getElementById('inst-history-' + sid);

    if (historyEl) {
      historyEl.innerHTML = buildHistoryRows(result.rows);
    }

    var pagerEl = document.getElementById('inst-pager-' + sid);

    if (pagerEl) {
      pagerEl.innerHTML = buildPagerControls(sid, result.page, result.totalPages, result.total);
      bindPagerButtons(pagerEl);
    }
  }

  function bindPagerButtons(pagerEl) {
    pagerEl.querySelectorAll('.pager-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var s = btn.getAttribute('data-sid');
        var p = parseInt(btn.getAttribute('data-page'), 10);

        if (s && p) {
          window.handlePagerClick(s, p);
        }
      });
    });
  }`;
}

function buildFormatDelta(): string {
  return `  function formatDelta(delta) {
    if (Math.abs(delta) < 0.05) return '';

    var sign = delta > 0 ? '+' : '';
    var rounded = Math.abs(delta) < 10 ? delta.toFixed(1) : Math.round(delta);
    return sign + rounded;
  }`;
}

function buildIsLowerBetter(): string {
  return `  var LOWER_IS_BETTER = [
    'complexity', 'avg_complexity', 'max_complexity',
    'lint', 'linter', 'warning', 'error', 'fail',
    'violation', 'issue', 'bug', 'debt', 'duplicate', 'smell'
  ];

  function isLowerBetter(key) {
    var lower = key.toLowerCase();

    for (var i = 0; i < LOWER_IS_BETTER.length; i++) {
      if (lower.indexOf(LOWER_IS_BETTER[i]) !== -1) return true;
    }

    return false;
  }`;
}

function buildDeltaColor(): string {
  return `  function deltaColor(delta, metricKey) {
    var invert = metricKey && isLowerBetter(metricKey);
    var positive = invert ? 'text-red-400' : 'text-green-400';
    var negative = invert ? 'text-green-400' : 'text-red-400';

    if (delta > 0) return positive;
    if (delta < 0) return negative;
    return 'text-slate-500';
  }`;
}

function buildDeltaHelpers(): string {
  return [buildFormatDelta(), buildIsLowerBetter(), buildDeltaColor()].join("\n\n");
}

function buildUpdateCurrentValue(): string {
  return `  function updateCurrentValue(sid, key, m) {
    var el = document.getElementById('inst-m-' + sid + '-' + key);

    if (el) {
      el.textContent = m[key] !== undefined ? String(m[key]) : '-';
    }
  }`;
}

function buildUpdateBaselineDelta(): string {
  return `  function updateBaselineDelta(sid, key, m, b) {
    var deltaEl = document.getElementById('inst-m-' + sid + '-' + key + '-delta');

    if (!deltaEl || m[key] === undefined || b[key] === undefined) return;

    var delta = m[key] - b[key];
    var text = formatDelta(delta);

    if (text) {
      deltaEl.textContent = text + ' since start';
      deltaEl.className = 'text-xs mt-1 font-medium ' + deltaColor(delta, key);
    } else {
      deltaEl.textContent = 'No changes';
      deltaEl.className = 'text-xs mt-1 font-medium text-yellow-400';
    }
  }`;
}

function buildUpdateLastDelta(): string {
  return `  function updateLastDelta(sid, key, m, p, previous) {
    var deltaLastEl = document.getElementById('inst-m-' + sid + '-' + key + '-delta-last');

    if (!deltaLastEl || m[key] === undefined || !previous || p[key] === undefined) return;

    var lastDelta = m[key] - p[key];
    var lastText = formatDelta(lastDelta);

    if (lastText) {
      deltaLastEl.textContent = lastText + ' since last loop';
      deltaLastEl.className = 'text-xs font-medium ' + deltaColor(lastDelta, key);
    } else {
      deltaLastEl.textContent = '';
    }
  }`;
}

function buildMetricsUpdateHeader(): string {
  return [
    buildUpdateCurrentValue(),
    buildUpdateBaselineDelta(),
    buildUpdateLastDelta(),
    `  function updateMetricKey(sid, key, m, b, p, previous, dataMetrics) {
    updateCurrentValue(sid, key, m);
    updateBaselineDelta(sid, key, m, b);
    updateLastDelta(sid, key, m, p, previous);

    if (dataMetrics.length > 0) {
      var chartId = 'chart-m-' + sid + '-' + key;
      var d = extractChartData(dataMetrics, key);
      updateChart(chartId, d.labels, d.data);
    }
  }`,
  ].join("\n\n");
}

function buildMetricsUpdateBody(): string {
  return [buildUpdateStatusAndHistory(), buildUpdateInstanceMetrics()].join("\n\n");
}

function buildUpdateStatusAndHistory(): string {
  return `  function updateStatusAndHistory(sid, latest, dataMetrics, metrics) {
    var loopEl = document.getElementById('inst-loop-' + sid);

    if (loopEl) {
      loopEl.textContent = latest.loop || '-';
    }

    var statusEl = document.getElementById('inst-status-' + sid);

    if (statusEl) {
      statusEl.textContent = latest.status || '-';
    }

    var source = dataMetrics.length > 0 ? dataMetrics : metrics;
    var reversed = source.slice().reverse();
    renderHistoryPage(sid, reversed);
  }`;
}

function buildFilterDataMetrics(): string {
  return `  function filterDataMetrics(metrics) {
    return metrics.filter(function(m) {
      return m.metrics && Object.keys(m.metrics).length > 0;
    });
  }

  function safeMetrics(entry) {
    return entry ? (entry.metrics || {}) : {};
  }`;
}

function buildExtractMetricSnapshots(): string {
  return [
    buildFilterDataMetrics(),
    `  function extractMetricSnapshots(metrics) {
    var dataMetrics = filterDataMetrics(metrics);
    var baseline = dataMetrics.length > 0 ? dataMetrics[0] : null;
    var previous = dataMetrics.length > 1 ? dataMetrics[dataMetrics.length - 2] : null;
    var latest = dataMetrics.length > 0 ? dataMetrics[dataMetrics.length - 1] : metrics[metrics.length - 1];

    return {
      dataMetrics: dataMetrics,
      m: safeMetrics(latest),
      b: safeMetrics(baseline),
      p: safeMetrics(previous),
      previous: previous,
      latest: latest
    };
  }`,
  ].join("\n\n");
}

function buildUpdateInstanceMetrics(): string {
  return [
    buildExtractMetricSnapshots(),
    `  function updateInstanceMetrics(sid, metrics) {
    if (!metrics.length) return;

    var snap = extractMetricSnapshots(metrics);
    var info = knownInstances[sid];

    if (!info) return;

    info.metricKeys.forEach(function(key) {
      updateMetricKey(sid, key, snap.m, snap.b, snap.p, snap.previous, snap.dataMetrics);
    });

    updateStatusAndHistory(sid, snap.latest, snap.dataMetrics, metrics);
  }`,
  ].join("\n\n");
}

function buildInstanceManagement(): string {
  return `  function instanceKey(inst) {
    return inst.command + '::' + inst.project;
  }

  function removePreviousInstance(newInst) {
    var key = instanceKey(newInst);
    var oldIds = Object.keys(instanceRegistry).filter(function(id) {
      return id !== newInst.instanceId && instanceKey(instanceRegistry[id]) === key;
    });

    oldIds.forEach(function(oldId) {
      var oldSid = shortId(oldId);
      $('#inst-' + oldSid).remove();
      delete instanceRegistry[oldId];
      delete knownInstances[oldSid];

      Object.keys(chartInstances).forEach(function(cid) {
        if (cid.indexOf(oldSid) !== -1) {
          chartInstances[cid].destroy();
          delete chartInstances[cid];
        }
      });
    });
  }`;
}

function buildDashboardRefresh(): string {
  return `  function refreshDashboard() {
    $.getJSON('/api/instances', function(instances) {
      var container = $('#instances-container');
      var countEl = $('#instance-count');
      var noInstances = $('#no-instances');
      countEl.text(instances.length + ' active instance' + (instances.length !== 1 ? 's' : ''));

      var now = new Date();
      $('#last-updated').text('Updated ' + now.toLocaleTimeString());

      if (instances.length > 0) {
        noInstances.hide();
      } else {
        noInstances.show();
      }

      var needsNavUpdate = false;

      instances.forEach(function(inst) {
        if (!instanceRegistry[inst.instanceId]) {
          removePreviousInstance(inst);
          instanceRegistry[inst.instanceId] = inst;
          needsNavUpdate = true;
        }

        var sid = shortId(inst.instanceId);

        if ($('#inst-' + sid).length === 0) {
          container.append(buildInstanceCard(sid));
        }

        $.getJSON('/api/instances/' + inst.instanceId, function(metrics) {
          var keys = discoverMetricKeys(metrics);
          ensureInstanceLayout(sid, inst, keys);
          updateInstanceMetrics(sid, metrics);
        });
      });

      if (needsNavUpdate) {
        updateNavButtons();
      }

      updateVisibility();
    });
  }`;
}

function buildModalHelpers(): string {
  return `  function buildModalMetricRow(label, value) {
    return '<div class="flex justify-between py-2 border-b border-slate-700">' +
      '<span class="text-slate-400">' + label + '</span>' +
      '<span class="text-white font-medium">' + value + '</span>' +
    '</div>';
  }

  function buildModalContent(row) {
    var html = '<div class="text-lg font-bold text-white mb-4">Loop ' + row.loop + '</div>';
    html += buildModalMetricRow('Status', statusBadge(row.status));
    html += buildModalMetricRow('Commit', row.commit || '-');

    if (row.timestamp) {
      html += buildModalMetricRow('Timestamp', row.timestamp);
    }

    html += buildModalMetricRow('Description', row.description || '-');
    var m = row.metrics || {};

    Object.keys(m).forEach(function(key) {
      html += buildModalMetricRow(formatLabel(key), m[key]);
    });

    return html;
  }`;
}

function buildModalHandlers(): string {
  return `  window.showLoopModal = function(trEl) {
    var raw = trEl.getAttribute('data-row');
    if (!raw) return;

    var row = JSON.parse(raw.replace(/&quot;/g, '"'));
    var modal = document.getElementById('loop-modal');
    if (!modal) return;

    modal.innerHTML = '<div class="loop-modal-backdrop" onclick="closeLoopModal()">' +
      '<div class="loop-modal-card" onclick="event.stopPropagation()">' +
        '<button class="absolute top-3 right-3 text-slate-400 hover:text-white text-xl leading-none" onclick="closeLoopModal()">&times;</button>' +
        buildModalContent(row) +
      '</div>' +
    '</div>';
    modal.style.display = '';
  };

  window.closeLoopModal = function() {
    var modal = document.getElementById('loop-modal');

    if (modal) {
      modal.style.display = 'none';
      modal.innerHTML = '';
    }
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      window.closeLoopModal();
    }
  });`;
}

function buildModalFunctions(): string {
  return [buildModalHelpers(), buildModalHandlers()].join("\n\n");
}

function buildTsvRefresh(): string {
  return `  function refreshTsvCommands() {
    $.getJSON('/api/commands', function(commands) {
      if (!commands || commands.length === 0) return;

      var container = $('#instances-container');
      var noInstances = $('#no-instances');

      commands.forEach(function(command) {
        $.getJSON('/api/tsv/' + command, function(reports) {
          if (!reports || reports.length === 0) return;

          noInstances.hide();

          var first = reports[0];
          var sid = shortId(first.instanceId);

          if (!instanceRegistry[first.instanceId]) {
            instanceRegistry[first.instanceId] = {
              instanceId: first.instanceId,
              command: first.command,
              project: first.project,
              firstSeen: first.timestamp,
              lastSeen: reports[reports.length - 1].timestamp,
              reportCount: reports.length
            };

            if ($('#inst-' + sid).length === 0) {
              container.append(buildInstanceCard(sid));
            }

            updateNavButtons();
          }

          var keys = discoverMetricKeys(reports);
          ensureInstanceLayout(sid, first, keys);
          updateInstanceMetrics(sid, reports);
          updateVisibility();
        });
      });
    });
  }`;
}

function buildInitSection(): string {
  return `  $(document).ready(function() {
    refreshDashboard();
    refreshTsvCommands();
    setInterval(refreshDashboard, 10000);
    setInterval(refreshTsvCommands, 10000);
  });`;
}
