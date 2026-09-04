const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY environment variable is missing or empty.");
  console.error("Please verify GEMINI_API_KEY in Repository Settings > Secrets and variables > Actions.");
  process.exit(1);
}

// Active Flash model endpoint with Google Search grounding
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

// Helper: Normalize URL to prevent tracking query duplicate bypass
function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(param => {
      u.searchParams.delete(param);
    });
    return (u.origin + u.pathname + u.search).replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

// Helper: Extract significant words for fuzzy comparison
function getSignificantWords(text) {
  if (!text) return new Set();
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'california', 'state', 'bill', 'court', 'news', 'update']);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  return new Set(words);
}

// Helper: Check if two headlines are essentially the same story (>60% word overlap)
function isFuzzyDuplicate(headlineA, headlineB) {
  const setA = getSignificantWords(headlineA);
  const setB = getSignificantWords(headlineB);
  if (setA.size === 0 || setB.size === 0) return false;

  let intersection = 0;
  setA.forEach(w => {
    if (setB.has(w)) intersection++;
  });

  const overlapA = intersection / setA.size;
  const overlapB = intersection / setB.size;
  return overlapA >= 0.60 || overlapB >= 0.60;
}

// Helper: Sleep function for exponential backoff retries
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  let attempt = 0;
  let delay = 3000; // start with 3 seconds

  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(`Querying Gemini API (Attempt ${attempt} of ${maxRetries})...`);
      const response = await fetch(url, options);

      if (response.ok) {
        return await response.json();
      }

      const errText = await response.text();
      // Retry on 503 (Unavailable / Deadline Expired), 429 (Rate Limit), or 500
      if ([500, 502, 503, 504, 429].includes(response.status) && attempt < maxRetries) {
        console.warn(`[HTTP ${response.status}] Temporary server delay: ${errText.slice(0, 120)}...`);
        console.log(`Retrying in ${delay / 1000}s...`);
        await sleep(delay);
        delay *= 2; // exponential backoff (3s -> 6s -> 12s)
        continue;
      }

      throw new Error(`Google API returned HTTP ${response.status}: ${errText}`);
    } catch (err) {
      if (attempt < maxRetries && (err.message.includes('503') || err.message.includes('fetch failed'))) {
        console.warn(`Network/timeout warning: ${err.message}. Retrying in ${delay / 1000}s...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

async function fetchDailyNews() {
  console.log("Starting intelligent balanced daily sweep (Legal & News) with anti-duplication...");

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'news.json');

  // Load existing archive
  let existingItems = [];
  if (fs.existsSync(outputPath)) {
    try {
      const rawExisting = fs.readFileSync(outputPath, 'utf-8');
      const parsedExisting = JSON.parse(rawExisting);
      if (Array.isArray(parsedExisting.items)) {
        existingItems = parsedExisting.items;
      }
    } catch (readErr) {
      console.warn("Notice: Initializing fresh archive.");
    }
  }

  // Pass up to 25 recent headlines to prevent reporting duplicate stories
  const recentHeadlines = existingItems
    .slice(0, 25)
    .map((item, idx) => `${idx + 1}. "${item.headline}"`)
    .join('\n');

  const prompt = `
You are an authoritative legal research editor for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) public charity.

Task:
Perform a fresh search for California firearm developments and return 3 to 4 total items:
- 1 to 2 Legal/Regulatory updates (Legislation, 9th Circuit rulings, or CA DOJ bulletins)
- 1 to 2 Authoritative news articles (AP, Reuters, LA Times, SF Chronicle, or CalMatters)

Do NOT select or repeat stories covering these recently archived headlines:
${recentHeadlines || 'None'}

Requirements:
- Factual & Nonpartisan: No editorializing or political campaign commentary.
- Use publication or agency name as "source_name" and the verified article link as "source_url".
- Return ONLY a valid JSON array matching this schema (do not wrap in markdown or prose):
[
  {
    "id": "unique-slug-id",
    "date": "YYYY-MM-DD",
    "category": "Legislation" | "Court Ruling" | "CA DOJ Notice" | "State News" | "Community Safety",
    "badge_status": "In Effect" | "Court Injunction" | "Regulatory Notice" | "News Report",
    "badge_color": "emerald" | "amber" | "blue" | "purple",
    "headline": "Informative headline",
    "statute_or_case": "Penal code, docket, or agency",
    "summary": "2-3 sentences explaining the development.",
    "community_takeaway": "Practical context for California gun owners and families.",
    "source_name": "Source name",
    "source_url": "https://..."
  }
]
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { 
      temperature: 0.2
    }
  };

  try {
    const result = await fetchWithRetry(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 3);

    // Extract text across all candidate parts (handles thinking blocks and multi-part tool results)
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textParts = parts.map(p => p.text).filter(Boolean);
    const rawContent = textParts.join('\n').trim();

    if (!rawContent) {
      console.error("Debug candidate dump:", JSON.stringify(result.candidates, null, 2));
      throw new Error("Empty text response received from Gemini.");
    }

    // Extract JSON array
    let cleanJson = rawContent;
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    const incomingItems = JSON.parse(cleanJson);

    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      throw new Error("Parsed response was not a non-empty array of items.");
    }

    // Build index of existing items for code-level deduplication
    const existingUrls = new Set(existingItems.map(i => cleanUrl(i.source_url)).filter(Boolean));
    const existingIds = new Set(existingItems.map(i => (i.id || '').toLowerCase()).filter(Boolean));

    const novelItems = [];

    for (const newItem of incomingItems) {
      const newCleanUrl = cleanUrl(newItem.source_url);
      const newId = (newItem.id || '').toLowerCase();

      // Check 1: Exact URL match
      if (newCleanUrl && existingUrls.has(newCleanUrl)) {
        console.log(`[Duplicate skipped by URL]: ${newItem.headline}`);
        continue;
      }

      // Check 2: Exact ID match
      if (newId && existingIds.has(newId)) {
        console.log(`[Duplicate skipped by ID]: ${newItem.headline}`);
        continue;
      }

      // Check 3: Fuzzy headline comparison against existing archive
      const isFuzzyDupe = existingItems.some(existing => isFuzzyDuplicate(newItem.headline, existing.headline));
      if (isFuzzyDupe) {
        console.log(`[Duplicate skipped by Fuzzy Headline Match]: ${newItem.headline}`);
        continue;
      }

      // Check 4: Fuzzy comparison against items within this same batch
      const isBatchDupe = novelItems.some(accepted => isFuzzyDuplicate(newItem.headline, accepted.headline));
      if (isBatchDupe) {
        console.log(`[Duplicate skipped within current batch]: ${newItem.headline}`);
        continue;
      }

      // Passed all checks
      if (newCleanUrl) existingUrls.add(newCleanUrl);
      if (newId) existingIds.add(newId);
      novelItems.push(newItem);
    }

    // Prepend novel items ahead of the existing archive
    const mergedList = [...novelItems, ...existingItems];

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

    // Always update verification timestamp so the live badge updates
    const outputData = {
      last_updated: now.toISOString(),
      updated_formatted: `${formattedDate} • ${formattedTime}`,
      items: mergedList
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

    if (novelItems.length > 0) {
      console.log(`✓ Success: Added ${novelItems.length} novel dispatches. Archive now contains ${mergedList.length} total historical records.`);
    } else {
      console.log(`✓ Daily sweep completed: No new novel stories detected today. Verified timestamp updated (${outputData.updated_formatted}).`);
    }

  } catch (error) {
    console.error("Execution failed:", error.message);
    process.exit(1);
  }
}

fetchDailyNews();
