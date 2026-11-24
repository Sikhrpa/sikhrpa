const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NEWS_FILE_PATH = path.join(DATA_DIR, 'news.json');
const LATEST_FILE_PATH = path.join(DATA_DIR, 'news-latest.json');

const DEDUP_WINDOW_DAYS = 14;
const URL_CHECK_TIMEOUT_MS = 8000;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'that', 'this', 'its', 'it', 'over',
  'into', 'under', 'new', 'state', 'california', 'ca', 'cal', 'gun', 'guns', 'firearm',
  'firearms', 'law', 'laws', 'act', 'bill', 'reports', 'report', 'details', 'examines',
  'analyzes', 'highlights', 'explores', 'covers', 'issues', 'releases', 'reaffirms',
  'confirms', 'advisory', 'notice', 'news', 'update', 'updates', 'court', 'ruling',
  'ninth', 'circuit', 'doj', 'bof', 'bureau', 'calmatters', 'abc10', 'latimes', 'times',
  'reload', 'sierra', 'sun', 'governor', 'newsom', 'signs', 'enacts',
  'federal', 'city', 'county', 'statewide', 'public', 'safety', 'community', 'legal',
  'rules', 'mandates', 'requirements', 'standards', 'programs', 'measures', 'package'
]);

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\bday\s+care\b/g, 'daycare')
    .replace(/\bl\.a\.\b/g, 'los angeles')
    .replace(/\blasd\b/g, 'los angeles sheriff')
    .replace(/\bconcealed\s+carry\s+weapon\b/g, 'ccw')
    .replace(/\bconcealed\s+carry\b/g, 'ccw')
    .replace(/\bconcealed\s+weapon\b/g, 'ccw')
    .replace(/\bretailers?\b/g, 'retail')
    .replace(/\bshops?\b/g, 'retail')
    .replace(/\btracing\b/g, 'trace')
    .replace(/\btraces\b/g, 'trace')
    .replace(/\bmunicipalities\b/g, 'municipal')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokens(str) {
  const stem = w => w.replace(/(ings|ing|ions|ion|ments|ment|ies|es|s)$/, m => (m === 'ies' ? 'y' : ''));
  return new Set(
    normalizeText(str)
      .split(' ')
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
      .map(w => (w.length > 4 ? stem(w) : w))
  );
}

function similarityScores(strA, strB) {
  const a = getTokens(strA);
  const b = getTokens(strB);
  if (a.size === 0 || b.size === 0) return { jaccard: 0, overlap: 0, shared: 0 };
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  const minSize = Math.min(a.size, b.size);
  return {
    jaccard: union === 0 ? 0 : inter / union,
    overlap: minSize === 0 ? 0 : inter / minSize,
    shared: inter
  };
}

function extractIdentifiers(item) {
  const text = `${item.statute_or_case || ''} ${item.headline || ''}`;
  const ids = new Set();

  // Bills: AB 1974, Assembly Bill 1974, SB 948, Senate Bill 948
  const billRe = /\b(?:assembly\s+bill|senate\s+bill|ab|sb)\s*[-#]?\s*(\d{1,4})\b/gi;
  for (const m of text.matchAll(billRe)) {
    const prefix = m[0].toLowerCase().startsWith('s') ? 'sb' : 'ab';
    ids.add(`bill:${prefix}${m[1]}`);
  }

  // CA DOJ Bulletins: 2026-DLE-14, 2026-BOF-01
  const bulRe = /\b(20\d{2}-[a-z]{2,5}-\d{1,3})\b/gi;
  for (const m of text.matchAll(bulRe)) {
    ids.add(`bulletin:${m[1].toLowerCase()}`);
  }

  // Court cases: X v. Y
  const caseRe = /\b([A-Z][A-Za-z0-9.'-]+(?:\s+[A-Z][A-Za-z0-9.'-]+){0,3})\s+v\.\s+([A-Z][A-Za-z0-9.'-]+(?:\s+(?:of\s+)?[A-Z][A-Za-z0-9.'-]+){0,3})/g;
  for (const m of text.matchAll(caseRe)) {
    const p = m[1].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const d = m[2].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const pLast = p.split(/\s+/).pop();
    const dFirst = d.split(/\s+/)[0];
    if (p.includes('united states') || p.includes('state of california') || p.includes('people')) {
      ids.add(`case:${p}_v_${d.replace(/\s+/g, '_')}`);
    } else {
      ids.add(`case:${pLast}_v_${dFirst}`);
      if (pLast.length >= 5) ids.add(`case_plaintiff:${pLast}`);
    }
  }

  return ids;
}

function getCanonicalArticleUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const p = u.pathname.replace(/\/+$/, '');
    if (!p || p === '/firearms' || p === '/justice' || p === '/firearms/bulletins' || p === '/firearms/regs') {
      return null;
    }
    const params = new URLSearchParams(u.search);
    for (const k of [...params.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) params.delete(k);
    }
    const qs = params.toString();
    return `${u.hostname.replace(/^www\./, '')}${p}${qs ? '?' + qs : ''}`;
  } catch {
    return null;
  }
}

function daysBetween(d1, d2) {
  const t1 = d1 ? new Date(d1).getTime() : 0;
  const t2 = d2 ? new Date(d2).getTime() : 0;
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return Infinity;
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

function isDuplicateItem(a, b, windowDays = DEDUP_WINDOW_DAYS) {
  if (a.id && b.id && a.id === b.id) return true;

  const normA = (a.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normB = (b.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normA && normB && normA === normB) return true;

  const days = daysBetween(a.date, b.date);
  if (days > windowDays) return false;

  // Same deep article URL within 14 days
  const urlA = getCanonicalArticleUrl(a.source_url);
  const urlB = getCanonicalArticleUrl(b.source_url);
  if (urlA && urlB && urlA === urlB) return true;

  // Shared bill, court case, or DOJ bulletin within 14 days
  const idsA = extractIdentifiers(a);
  const idsB = extractIdentifiers(b);
  for (const id of idsA) {
    if (idsB.has(id)) return true;
  }

  // Fuzzy headline similarity within 14 days
  const hlSim = similarityScores(a.headline, b.headline);
  if (hlSim.jaccard >= 0.4 || (hlSim.overlap >= 0.5 && hlSim.shared >= 3)) return true;

  // Combined headline + statute similarity within 14 days
  const fullSim = similarityScores(`${a.headline} ${a.statute_or_case}`, `${b.headline} ${b.statute_or_case}`);
  if (fullSim.jaccard >= 0.4 || (fullSim.overlap >= 0.55 && fullSim.shared >= 4)) return true;

  // Tighter same-story cluster detection within 2 days (e.g., same local zoning or trace-data story)
  if (days <= 2) {
    if ((fullSim.overlap >= 0.4 && fullSim.shared >= 3) || (fullSim.overlap >= 0.35 && fullSim.shared >= 4)) return true;
    const sumSim = similarityScores(`${a.headline} ${a.summary}`, `${b.headline} ${b.summary}`);
    if (sumSim.jaccard >= 0.25 && sumSim.shared >= 5) return true;
  }

  return false;
}

function scoreItemQuality(item) {
  let score = 0;
  const url = item.source_url || '';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname || '';
    if (host === 'leginfo.legislature.ca.gov' && pathname.startsWith('/faces/billNavClient')) {
      score += 6;
    } else if (
      host === 'cdn.ca9.uscourts.gov' ||
      (host === 'oag.ca.gov' && pathname.startsWith('/system/files')) ||
      ((host === 'justice.gov' || host === 'www.justice.gov') && pathname.startsWith('/opa/pr'))
    ) {
      score += 6;
    }
    if (pathname.length > 10) score += 2;
  } catch {}
  if (['Legislation', 'Court Ruling', 'CA DOJ Notice'].includes(item.category)) score += 2;
  return score;
}

function sanitizeHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {}
  return '';
}

async function isUrlReachable(urlStr) {
  const safeUrl = sanitizeHttpUrl(urlStr);
  if (!safeUrl) return { ok: false, reason: 'Invalid protocol or URL' };

  const headers = {
    'User-Agent': 'SikhRPA-LegalWatch/1.0 (+https://sikhrpa.org; president@sikhrpa.org)',
    'Accept': 'text/html,application/pdf,*/*;q=0.8'
  };

  async function probe(method) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(safeUrl, {
        method,
        redirect: 'follow',
        headers,
        signal: controller.signal
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let status = await probe('HEAD');
    // Retry with GET if server rejects HEAD (405/403/501)
    if (status === 405 || status === 403 || status === 501) {
      status = await probe('GET');
    }
    // Accept 2xx/3xx, plus 403/429 (common WAF bot blocks on valid news/gov pages)
    if ((status >= 200 && status < 400) || status === 403 || status === 429) {
      return { ok: true, status };
    }
    return { ok: false, status, reason: `HTTP ${status}` };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'Timeout' : err.message };
  }
}

function buildLatestPayload(outputData) {
  const latestItems = Array.isArray(outputData.items) ? outputData.items.slice(0, 1) : [];
  return {
    last_updated: outputData.last_updated,
    updated_formatted: outputData.updated_formatted,
    total_count: Array.isArray(outputData.items) ? outputData.items.length : 0,
    items: latestItems
  };
}

function writeNewsOutputs(outputData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(NEWS_FILE_PATH, JSON.stringify(outputData, null, 2) + '\n', 'utf-8');
  const latestPayload = buildLatestPayload(outputData);
  fs.writeFileSync(LATEST_FILE_PATH, JSON.stringify(latestPayload, null, 2) + '\n', 'utf-8');
}

async function fetchBiWeeklyNews() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is missing.');
    process.exit(1);
  }

  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

  let existingArchive = { items: [] };
  if (fs.existsSync(NEWS_FILE_PATH)) {
    try {
      existingArchive = JSON.parse(fs.readFileSync(NEWS_FILE_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Existing news.json could not be parsed. Starting fresh.');
      existingArchive = { items: [] };
    }
  }

  const existingItems = Array.isArray(existingArchive.items) ? existingArchive.items : [];

  // Provide recent archive headlines to the prompt so Gemini avoids already-covered stories
  const recentHeadlinesContext = existingItems
    .slice(0, 25)
    .map(it => `- [${it.date || 'N/A'}] (${it.statute_or_case || 'N/A'}) ${it.headline || ''}`)
    .join('\n');

  console.log('Querying Gemini with Google Search Grounding for recent California firearms legal updates...');

  const currentDateIso = new Date().toISOString().split('T')[0];

  const prompt = `
You are an authoritative legal research editor for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public charity.

Task:
Perform a targeted search for RECENT, NOVEL California firearm developments and return two balanced categories of verified updates (4 to 6 items in total):

1. Official Government & Judicial Dispatches (2 to 3 items):
   - Federal court orders, 9th Circuit rulings, or District Court preliminary injunctions/stays.
   - California Department of Justice (CA DOJ) Bureau of Firearms bulletins, regulatory advisories, or information notices.
   - Official California State Legislature chaptered bill developments.
   - "source_name" must be the official government body or court docket (e.g., "U.S. Court of Appeals for the Ninth Circuit", "CA DOJ Bureau of Firearms", "California State Legislature").
   - "category" should be "Court Ruling", "CA DOJ Notice", or "Legislation".

2. Reputable News & Investigative Media Coverage (2 to 3 items):
   - In-depth news reports, investigative reporting, or local California coverage of firearm regulations, retail impacts, community safe storage initiatives, or municipal legal disputes.
   - "source_name" must be a verified news organization (e.g., "CalMatters", "Los Angeles Times", "Associated Press", "San Francisco Chronicle", "The Reload", "CBS News Bay Area / Sacramento").
   - "category" should be "State News" or "Community Safety".

ALREADY COVERED IN OUR ARCHIVE (DO NOT DUPLICATE OR REPHRASE THESE UNLESS THERE IS A NEW SUBSEQUENT COURT RULING OR MAJOR STATUS CHANGE):
${recentHeadlinesContext || '(Archive currently empty)'}

CRITICAL DATE, URL & RECENCY RULES:
- Focus on recent news and legal actions from the LAST 30 TO 60 DAYS relative to ${currentDateIso}.
- The "date" field MUST reflect the ACTUAL DATE OF PUBLICATION OR COURT FILING (format: YYYY-MM-DD).
- NEVER use a future statutory effective date (e.g., DO NOT use "January 1" or "July 1" when a law goes into effect). The date must represent when the news or decision occurred.
- DO NOT return generic annual roundups (e.g. "Laws taking effect Jan 1").
- The date MUST NOT be in the future (it cannot be later than ${currentDateIso}).
- Every "source_url" MUST be a real, live, directly verifiable HTTPS URL from Google Search results (never fabricate or guess article slugs).

Output Format:
Return ONLY valid JSON (no markdown ticks, no surrounding codeblock markers, no conversation text).
Follow this exact schema:
[
  {
    "id": "unique-kebab-slug",
    "date": "YYYY-MM-DD",
    "category": "Legislation" | "Court Ruling" | "CA DOJ Notice" | "State News" | "Community Safety",
    "badge_status": "Active" | "Stayed / Enjoined" | "Pending Review" | "In Effect" | "Regulatory Notice",
    "badge_color": "emerald" | "amber" | "blue" | "purple",
    "headline": "Concise, factual headline describing the recent event",
    "statute_or_case": "e.g., Boland v. Bonta, SB 2, or CA Penal Code § 25100",
    "summary": "2 concise sentences explaining what happened and what the legal requirement or status is.",
    "community_takeaway": "Actionable advice for first-time owners and families (what to do or verify).",
    "source_name": "Official entity or major news outlet (e.g., 9th Circuit, CA DOJ, CalMatters)",
    "source_url": "Direct HTTPS URL to official court docket, CA legislature site, or verified article"
  }
]
`;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    tools: [{
      googleSearch: {} // Live Google Search Grounding
    }],
    generationConfig: {
      temperature: 0.1 // Low temperature for factual precision (no responseMimeType tool conflict)
    }
  };

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (!candidate) {
      console.error('Full Gemini API response:', JSON.stringify(result, null, 2));
      throw new Error('No candidate returned from Gemini API.');
    }

    const parts = candidate.content?.parts || [];
    const rawContent = parts.map(p => p.text || '').join('').trim();

    if (!rawContent) {
      console.error('Empty candidate received:', JSON.stringify(candidate, null, 2));
      throw new Error(`Empty response received from Gemini (finishReason: ${candidate.finishReason || 'UNKNOWN'}).`);
    }

    let cleanJsonText = rawContent;
    const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      cleanJsonText = jsonMatch[0];
    } else {
      cleanJsonText = cleanJsonText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    }

    const incomingItems = JSON.parse(cleanJsonText);

    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      throw new Error('Response was not a valid non-empty array of news items.');
    }

    const nowMs = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    // Sanitize incoming dates & URLs
    const sanitizedIncoming = incomingItems.map(item => {
      let itemDate = item.date || todayStr;
      const itemTime = new Date(itemDate).getTime();
      if (!Number.isFinite(itemTime) || itemTime > nowMs) {
        console.warn(`Clamping invalid/future date "${itemDate}" for "${item.headline}" to today: ${todayStr}`);
        itemDate = todayStr;
      }
      return {
        ...item,
        date: itemDate,
        source_url: sanitizeHttpUrl(item.source_url)
      };
    });

    // Deduplicate against existing archive AND within the incoming batch itself
    const candidateNovel = [];
    for (const newItem of sanitizedIncoming) {
      const dupInArchive = existingItems.some(oldItem => isDuplicateItem(oldItem, newItem, DEDUP_WINDOW_DAYS));
      const dupInBatch = candidateNovel.some(keptItem => isDuplicateItem(keptItem, newItem, DEDUP_WINDOW_DAYS));
      if (dupInArchive || dupInBatch) {
        console.log(`Skipping duplicate dispatch: "${newItem.headline}"`);
        continue;
      }
      candidateNovel.push(newItem);
    }

    // Verify HTTP URL reachability for novel items
    const verifiedNovelItems = [];
    for (const item of candidateNovel) {
      if (!item.source_url) {
        console.warn(`Skipping dispatch with missing/invalid URL: "${item.headline}"`);
        continue;
      }
      const check = await isUrlReachable(item.source_url);
      if (!check.ok) {
        console.warn(`Skipping dispatch with unreachable URL (${check.reason}): ${item.source_url}`);
        continue;
      }
      verifiedNovelItems.push(item);
    }

    console.log(`Found ${verifiedNovelItems.length} novel verified legal dispatches.`);

    const mergedList = [...verifiedNovelItems, ...existingItems];

    mergedList.sort((a, b) => {
      const timeA = Math.min(a.date ? new Date(a.date).getTime() : 0, nowMs);
      const timeB = Math.min(b.date ? new Date(b.date).getTime() : 0, nowMs);
      return timeB - timeA;
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: 'America/Los_Angeles'
    });

    const outputData = {
      last_updated: now.toISOString(),
      updated_formatted: `${formattedDate} • ${formattedTime}`,
      items: mergedList
    };

    writeNewsOutputs(outputData);
    console.log(`Successfully updated ${NEWS_FILE_PATH} (${mergedList.length} entries) and ${LATEST_FILE_PATH}.`);

  } catch (error) {
    console.error('Failed to fetch or process news updates:', error);
    process.exit(1);
  }
}

module.exports = {
  isDuplicateItem,
  scoreItemQuality,
  sanitizeHttpUrl,
  isUrlReachable,
  buildLatestPayload,
  writeNewsOutputs
};

if (require.main === module) {
  fetchBiWeeklyNews();
}
