import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================================
// CONFIGURATION (from environment variables)
// ============================================================================
const API_BASE  = __ENV.API_BASE  || 'http://localhost:5000/api';
const COMMUNITY = __ENV.COMMUNITY || 'TEST_COMMUNITY';

// Test mode: 'normal' (full crypto) or 'baseline' (no crypto)
const TEST_MODE = __ENV.TEST_MODE || 'normal';

// Concurrency: if 'true' -> use scenario with multiple VUs, else sequential
const CONCURRENT = __ENV.CONCURRENT === 'true';

// For concurrent test: number of VUs and test duration
const VUS       = parseInt(__ENV.VUS)       || 5;
const DURATION  = __ENV.DURATION            || '2m';

// Admin list (same as before)
const ADMIN_CONFIGS = [
  { adminId: '69cdfc3cede7f0ad5694b4bd', refCode: 'TES2938' },
  { adminId: '69cdfc3cede7f0ad5694b4c1', refCode: 'TES6967' },
  { adminId: '69cdfc3dede7f0ad5694b4c5', refCode: 'TES99X8' },
  { adminId: '69cdfc3dede7f0ad5694b4c9', refCode: 'TES6635' },
  { adminId: '69cdfc3dede7f0ad5694b4cd', refCode: 'TES7285' },
  { adminId: '69cdfc3eede7f0ad5694b4d1', refCode: 'TES9529' },
  { adminId: '69cdfc3eede7f0ad5694b4d5', refCode: 'TES2996' },
  { adminId: '69cdfc3eede7f0ad5694b4d9', refCode: 'TES9993' },
  { adminId: '69cdfc3fede7f0ad5694b4dd', refCode: 'TES89X6' },
  { adminId: '69cdfc3fede7f0ad5694b4e1', refCode: 'TES2835' },
];

// ============================================================================
// METRICS (same as before)
// ============================================================================
const approvalLatency = new Trend('approval_latency_ms', true);
const approvalSuccess = new Rate('approval_success_rate');
const approvalFailed  = new Counter('approval_failed_total');
const approvalDone    = new Counter('approval_done_total');

const aesDecryptMs   = new Trend('crypto_aes_decrypt_ms', true);
const adminSignMs    = new Trend('crypto_admin_sign_ms', true);
const adminVerifyMs  = new Trend('crypto_admin_verify_ms', true);
const sha256Ms       = new Trend('crypto_sha256_ms', true);
const systemSignMs   = new Trend('crypto_system_sign_ms', true);
const systemVerifyMs = new Trend('crypto_system_verify_ms', true);
const cryptoTotalMs  = new Trend('crypto_total_ms', true);

const casRetryRate  = new Rate('cas_retry_rate');
const casRetryCount = new Counter('cas_retries_total');

// ============================================================================
// OPTIONS – dynamic based on CONCURRENT flag
// ============================================================================
export let options = {};

if (CONCURRENT) {
  // Concurrent test: multiple VUs, fixed duration
  options = {
    scenarios: {
      concurrent: {
        executor: 'constant-vus',
        vus: VUS,
        duration: DURATION,
        gracefulStop: '30s',
        startTime: '0s',
      },
    },
    thresholds: {
      'approval_latency_ms':   ['p(95)<10000'],
      'approval_success_rate': ['rate>0.90'],
    },
    summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  };
} else {
  // Sequential test: 1 VU, 1 iteration – all work inside setup()
  options = {
    vus: 1,
    iterations: 1,
    setupTimeout: '30m',
    thresholds: {
      'approval_latency_ms':   ['p(95)<10000'],
      'approval_success_rate': ['rate>0.90'],
    },
    summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  };
}

// ============================================================================
// HELPERS
// ============================================================================
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'x-test-mode': TEST_MODE === 'baseline' ? 'baseline' : 'normal',
};

function recordCryptoHeaders(res) {
  const p = (k) => parseFloat(res.headers[k]);
  if (!isNaN(p('X-AES-Decrypt-Ms')))     aesDecryptMs.add(p('X-AES-Decrypt-Ms'));
  if (!isNaN(p('X-Admin-Sign-Ms')))      adminSignMs.add(p('X-Admin-Sign-Ms'));
  if (!isNaN(p('X-Admin-Verify-Ms')))    adminVerifyMs.add(p('X-Admin-Verify-Ms'));
  if (!isNaN(p('X-SHA256-Ms')))          sha256Ms.add(p('X-SHA256-Ms'));
  if (!isNaN(p('X-System-Sign-Ms')))     systemSignMs.add(p('X-System-Sign-Ms'));
  if (!isNaN(p('X-System-Verify-Ms')))   systemVerifyMs.add(p('X-System-Verify-Ms'));
  if (!isNaN(p('X-Crypto-Overhead-Ms'))) cryptoTotalMs.add(p('X-Crypto-Overhead-Ms'));
}

function fetchCandidates(admin) {
  const res = http.request(
    'GET',
    `${API_BASE}/admin/get-users-without-community`,
    JSON.stringify({ adminId: admin.adminId }),
    { headers: JSON_HEADERS, timeout: '20s', tags: { name: 'fetch_candidates' } }
  );

  if (res.status !== 200) {
    console.warn(`[fetch] admin=${admin.refCode} HTTP=${res.status}`);
    return [];
  }

  try {
    const data = res.json('data');
    return Array.isArray(data) ? data.map((c) => c._id) : [];
  } catch (e) {
    console.warn(`[fetch] admin=${admin.refCode} parse error: ${e.message}`);
    return [];
  }
}

function assignCandidate(admin, candidateId, index, total, vuInfo = '') {
  const payload = JSON.stringify({
    adminId:    admin.adminId,
    _id:        candidateId,
    community:  COMMUNITY,
    deviceData: {
      fingerprint: `k6-${TEST_MODE}-${admin.refCode}-${index}`,
      userAgent:   `k6/${CONCURRENT ? 'concurrent' : 'sequential'}/1.0`,
    },
  });

  const start   = Date.now();
  const res     = http.post(
    `${API_BASE}/admin/assign-community-to-candidate`,
    payload,
    { headers: JSON_HEADERS, timeout: '30s', tags: { name: 'assign_candidate' } }
  );
  const latency = Date.now() - start;

  approvalLatency.add(latency);
  recordCryptoHeaders(res);

  let body = {};
  try { body = res.json(); } catch (_) {}

  const ok = res.status === 200 && body.message === 'success';
  approvalSuccess.add(ok ? 1 : 0);

  if (ok) {
    approvalDone.add(1);
    console.log(`[OK]   ${vuInfo} admin=${admin.refCode} candidate=${candidateId} (${index + 1}/${total}) latency=${latency}ms`);
  } else {
    approvalFailed.add(1);
    console.warn(`[FAIL] ${vuInfo} admin=${admin.refCode} candidate=${candidateId} HTTP=${res.status}`);
  }

  const retries = Number(body.retryCount) || Number(res.headers['X-CAS-Retries']) || 0;
  casRetryRate.add(retries > 0 ? 1 : 0);
  if (retries > 0) casRetryCount.add(retries);

  check(res, {
    'HTTP 200':          (r) => r.status === 200,
    'message=success':   ()  => ok,
    'latency < 2000ms':  ()  => latency < 2000,
    'latency < 5000ms':  ()  => latency < 5000,
    'latency < 10000ms': ()  => latency < 10000,
  });

  return ok;
}

// ============================================================================
// SETUP (only used for sequential mode)
// ============================================================================
export function setup() {
  if (CONCURRENT) {
    // For concurrent mode, we don't need to do anything in setup;
    // each VU will fetch its own candidates or we can pre‑fetch and share.
    // To avoid overloading the server with repeated fetch calls,
    // we pre‑fetch all candidates once and store them in an array that each VU can access.
    console.log(`\n=== Concurrent test mode | VUs=${VUS} | duration=${DURATION} | TEST_MODE=${TEST_MODE} ===\n`);
    const allCandidates = [];
    for (const admin of ADMIN_CONFIGS) {
      const candidates = fetchCandidates(admin);
      console.log(`Admin ${admin.refCode}: ${candidates.length} candidates`);
      for (const candId of candidates) {
        allCandidates.push({ admin, candidateId: candId });
      }
    }
    console.log(`\nTotal candidates: ${allCandidates.length}\n`);
    // Return the list so it can be used in the default function
    return { allCandidates, total: allCandidates.length };
  } else {
    // Sequential mode: do all work here, then exit
    console.log(`\n=== Sequential test mode | TEST_MODE=${TEST_MODE} ===\n`);
    const work = [];
    for (const admin of ADMIN_CONFIGS) {
      const candidateIds = fetchCandidates(admin);
      console.log(`Admin ${admin.refCode}: ${candidateIds.length} candidates`);
      for (const candidateId of candidateIds) {
        work.push({ admin, candidateId });
      }
    }
    const total = work.length;
    console.log(`\nTotal: ${total} candidates. Processing sequentially...\n`);
    let succeeded = 0, failed = 0;
    for (let i = 0; i < work.length; i++) {
      const { admin, candidateId } = work[i];
      const ok = assignCandidate(admin, candidateId, i, total, '[SEQ]');
      if (ok) succeeded++; else failed++;
      sleep(0.3); // slight delay between requests
    }
    console.log(`\n=== Finished | Total=${total} | Succeeded=${succeeded} | Failed=${failed} ===\n`);
    // In sequential mode, we don't run default() because iterations=1 and setup() already did everything.
    // To avoid double work, we exit here. k6 will still call default() but we can make it a no‑op.
    // We'll set a flag to skip default.
    return { done: true };
  }
}

// ============================================================================
// DEFAULT FUNCTION (for concurrent mode)
// ============================================================================
let sharedCandidates = null;
let candidateIndex = 0;

export default function (data) {
  if (!CONCURRENT) {
    // Sequential mode: setup already processed all candidates.
    // Do nothing here.
    return;
  }

  // Concurrent mode: data comes from setup() return value
  if (!sharedCandidates && data && data.allCandidates) {
    sharedCandidates = data.allCandidates;
    // Each VU will pick a unique starting index to avoid contention on the same candidate?
    // We'll use a simple round‑robin using the VU id.
    const vuId = __VU; // k6 built‑in VU ID (1‑based)
    candidateIndex = (vuId - 1) % sharedCandidates.length;
  }

  if (!sharedCandidates || sharedCandidates.length === 0) {
    console.error('No candidates to process');
    return;
  }

  // Each VU iterates over its own slice of candidates (round‑robin)
  const idx = candidateIndex % sharedCandidates.length;
  const { admin, candidateId } = sharedCandidates[idx];
  candidateIndex++;

  const ok = assignCandidate(admin, candidateId, idx, sharedCandidates.length, `[VU${__VU}]`);
  // Small sleep to avoid overwhelming the server
  sleep(0.1);
}