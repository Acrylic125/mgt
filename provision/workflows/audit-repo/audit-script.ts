// n8n Code nodes stringify this body; AUDIT_REPOS is read from $env at runtime.
const jsCode = `
const LF = String.fromCharCode(10);
const CONCURRENCY = 3;
const POLL_MS = 5000;
// Per-repo cap so a stuck runner cannot hold the daily execution forever.
const MAX_WAIT_MS = 90 * 60 * 1000;

const helpers = this.helpers;
if (!helpers || typeof helpers.httpRequest !== 'function') {
  throw new Error('Code node HTTP helper is unavailable');
}
const httpRequest = helpers.httpRequest.bind(helpers);

let baseUrl = 'http://n8n-runner-service:3000';
if ($env.N8N_RUNNER_SERVICE_URL) {
  baseUrl = String($env.N8N_RUNNER_SERVICE_URL);
}
baseUrl = baseUrl.replace(/\\/+$/, '');

function parseAuditRepos(raw) {
  if (!raw) {
    throw new Error('AUDIT_REPOS is not set');
  }
  const repos = String(raw)
    .split(',')
    .map(function (repo) {
      return repo.trim();
    })
    .filter(function (repo) {
      return repo.length > 0;
    });
  if (repos.length === 0) {
    throw new Error('AUDIT_REPOS is empty');
  }
  return repos;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function requestJson(method, url, body) {
  const options = {
    method: method,
    url: url,
    json: true,
  };
  if (body !== undefined) {
    options.body = body;
  }
  return httpRequest(options);
}

function formatTracked(repo, outcome) {
  if (outcome.kind === 'failed') {
    let message = 'unknown error';
    if (outcome.message) {
      message = String(outcome.message).replace(/\s+/g, ' ').trim();
    }
    return '- ❌ ' + repo + ' ' + message;
  }
  if (outcome.mrUrl) {
    return '- ⚠️ ' + repo + ' ' + outcome.mrUrl;
  }
  return '- ✅ ' + repo + ' Audited with no issues';
}

async function auditRepo(repo) {
  let runnerId;
  try {
    const created = await requestJson('POST', baseUrl + '/api/v1/runners/audit-repo', { repo: repo });
    runnerId = created.runnerId;
  } catch (error) {
    let message = 'failed to start runner';
    if (error instanceof Error) {
      message = error.message;
    }
    return { kind: 'failed', message: message };
  }

  if (!runnerId || typeof runnerId !== 'string') {
    return { kind: 'failed', message: 'runner service did not return runnerId' };
  }

  const startedAt = Date.now();
  while (true) {
    await sleep(POLL_MS);
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      return { kind: 'failed', message: 'timed out waiting for runner ' + runnerId };
    }

    try {
      const status = await requestJson(
        'GET',
        baseUrl + '/api/v1/runners/audit-repo/' + runnerId,
      );
      if (status.status === 'failed') {
        let message = 'runner failed';
        if (status.message) {
          message = status.message;
        }
        return { kind: 'failed', message: message };
      }
      if (status.status === 'completed') {
        let mrUrl;
        if (status.auditResult && status.auditResult.mrUrl) {
          mrUrl = status.auditResult.mrUrl;
        }
        return { kind: 'completed', mrUrl: mrUrl };
      }
    } catch (error) {
      let message = 'failed to poll runner';
      if (error instanceof Error) {
        message = error.message;
      }
      return { kind: 'failed', message: message };
    }
  }
}

async function runWithLimit(items, limit, worker) {
  const results = [];
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor;
      cursor = cursor + 1;
      results[index] = await worker(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  if (workerCount === 0) {
    return results;
  }

  const starters = [];
  for (let i = 0; i < workerCount; i++) {
    starters.push(runOne());
  }
  await Promise.all(starters);
  return results;
}

const run = async function () {
  const repos = parseAuditRepos($env.AUDIT_REPOS);
  const outcomes = await runWithLimit(repos, CONCURRENCY, auditRepo);
  const lines = ['**AUDIT REPOS**'];
  for (let i = 0; i < repos.length; i++) {
    lines.push(formatTracked(repos[i], outcomes[i]));
  }
  return [{ json: { text: lines.join(LF) } }];
};

return run();
`.trim();

export const auditScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode,
};
