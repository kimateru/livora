const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Heuristic fallback summarizer for when AI is unavailable
function buildHeuristicSummary(counts, address, radius) {
    const get = (k) => counts[k] || 0;
    const groceryKeys = ['supermarket','hypermarket','convenience','greengrocer','butcher','bakery','grocery','deli','farm','organic','health_food','cheese','beverages'];
    const restaurantKeys = ['restaurant','fast_food','food_court'];
    const cafeKeys = ['cafe','ice_cream'];
    const parkKeys = ['park','garden','recreation_ground','common','nature_reserve'];

    const groceries = groceryKeys.reduce((s, k) => s + get(k), 0);
    const restaurants = restaurantKeys.reduce((s, k) => s + get(k), 0);
    const cafes = cafeKeys.reduce((s, k) => s + get(k), 0);
    const fuel = get('fuel');
    const parks = parkKeys.reduce((s, k) => s + get(k), 0);

    const parts = [];
    if (cafes) parts.push(`${cafes} coffee shop${cafes === 1 ? '' : 's'}`);
    if (restaurants) parts.push(`${restaurants} restaurant${restaurants === 1 ? '' : 's'}`);
    if (groceries) parts.push(`${groceries} grocery option${groceries === 1 ? '' : 's'}`);
    if (parks) parts.push(`${parks} park${parks === 1 ? '' : 's'}`);
    if (fuel) parts.push(`${fuel} fuel station${fuel === 1 ? '' : 's'}`);

    const firstLine = parts.length
        ? `Within ${radius || 'the specified'}m of this address, there are ${parts.join(', ')}.`
        : `Within ${radius || 'the specified'}m, no notable amenities were found.`;

    const qualifiers = [];
    if (cafes + restaurants >= 4) qualifiers.push('a lively food-and-coffee scene');
    else if (cafes + restaurants > 0) qualifiers.push('some dining and coffee options');
    if (groceries >= 2) qualifiers.push('good convenience for daily needs');
    else if (groceries === 0) qualifiers.push('limited access to groceries');
    if (parks <= 1) qualifiers.push('limited green space');
    else if (parks >= 3) qualifiers.push('plenty of green areas');
    if (fuel >= 2) qualifiers.push('solid access for drivers');

    const secondLine = qualifiers.length ? `Overall, the area feels ${qualifiers.join(', ')}.` : '';
    return [firstLine, secondLine].filter(Boolean).join(' ');
}

// Personalize the base summary with simple rule-based signals from preferences
function personalizeSummary(baseSummary, counts, preferences = {}) {
    const prefs = {
        stayType: 'live',
        eatOut: 'sometimes',
        groceries: 'weekly',
        parksNeed: 'medium',
        ...preferences
    };

    const get = (k) => counts[k] || 0;
    const groceriesCount = ['supermarket','hypermarket','convenience','greengrocer','butcher','bakery','grocery','deli','farm','organic','health_food','cheese','beverages']
        .reduce((s, k) => s + get(k), 0);
    const diningCount = ['restaurant','fast_food','food_court','cafe','ice_cream']
        .reduce((s, k) => s + get(k), 0);
    const parksCount = ['park','garden','recreation_ground','common','nature_reserve']
        .reduce((s, k) => s + get(k), 0);

    let verdict = 'Overall fit: neutral.';
    let score = 0;

    // Eating out preference
    if (prefs.eatOut === 'often') score += Math.min(diningCount, 5);
    if (prefs.eatOut === 'rarely') score += 1; // neutral

    // Groceries preference
    if (prefs.groceries === 'daily') score += Math.min(groceriesCount, 4);
    if (prefs.groceries === 'few_times_week') score += Math.min(groceriesCount, 3);

    // Parks need
    if (prefs.parksNeed === 'high') score += parksCount >= 2 ? 3 : -3;
    if (prefs.parksNeed === 'medium') score += parksCount >= 1 ? 1 : -1;

    // Travel vs live: weight dining for travel, groceries/parks for live
    if (prefs.stayType === 'travel') score += diningCount >= 2 ? 2 : 0;
    if (prefs.stayType === 'live') score += (groceriesCount >= 2 ? 2 : -1) + (parksCount >= 1 ? 1 : -1);

    if (score >= 6) verdict = 'Overall fit: great for your preferences.';
    else if (score >= 3) verdict = 'Overall fit: good match.';
    else if (score <= -2) verdict = 'Overall fit: may not align well with your needs.';

    return `${baseSummary} ${verdict}`.trim();
}

// Build structured ratings and verdict heuristically
function buildHeuristicRatings(groups, preferences, baseSummary) {
    const prefs = {
        stayType: 'live',
        eatOut: 'sometimes',
        groceries: 'weekly',
        parksNeed: 'medium',
        ...preferences
    };

    const clamp = (n) => Math.max(0, Math.min(10, Math.round(n)));

    const scoreFood = (count, pref) => {
        if (pref === 'often') return clamp(count >= 5 ? 10 : count >= 3 ? 8 : count >= 2 ? 6 : count === 1 ? 4 : 2);
        if (pref === 'sometimes') return clamp(count >= 5 ? 9 : count >= 3 ? 8 : count >= 2 ? 7 : count === 1 ? 6 : 5);
        // rarely
        return clamp(count === 0 ? 8 : 9);
    };
    const scoreGroceries = (count, pref) => {
        if (pref === 'daily') return clamp(count >= 4 ? 10 : count >= 3 ? 9 : count >= 2 ? 7 : count === 1 ? 5 : 1);
        if (pref === 'few_times_week') return clamp(count >= 4 ? 9 : count >= 3 ? 8 : count >= 2 ? 7 : count === 1 ? 6 : 3);
        if (pref === 'weekly') return clamp(count >= 3 ? 9 : count >= 2 ? 8 : count === 1 ? 7 : 6);
        // rarely
        return clamp(count === 0 ? 8 : 9);
    };
    const scoreParks = (count, need) => {
        if (need === 'high') return clamp(count >= 3 ? 9 : count === 2 ? 7 : count === 1 ? 4 : 0);
        if (need === 'medium') return clamp(count >= 3 ? 9 : count === 2 ? 8 : count === 1 ? 7 : 6);
        // low need: lack of parks should not penalize
        return clamp(count === 0 ? 8 : 9);
    };
    const scoreFuel = (count) => clamp(count >= 3 ? 9 : count === 2 ? 8 : count === 1 ? 7 : 6);

    const foodScore = scoreFood(groups.food, prefs.eatOut);
    const groceriesScore = scoreGroceries(groups.groceries, prefs.groceries);
    const parksScore = scoreParks(groups.parks, prefs.parksNeed);
    const fuelScore = scoreFuel(groups.fuel);

    const ratings = {
        food: { score: foodScore, reason: `${groups.food} dining/coffee options nearby${prefs.eatOut === 'often' ? ' — you value this highly.' : prefs.eatOut === 'rarely' ? ' — low priority for you.' : '.'}` },
        groceries: { score: groceriesScore, reason: `${groups.groceries} grocery options nearby${prefs.groceries === 'daily' ? ' — frequent shopping preference noted.' : prefs.groceries === 'rarely' ? ' — low priority for you.' : '.'}` },
        parks: { score: parksScore, reason: `${groups.parks} park areas nearby${prefs.parksNeed === 'low' ? ' — low priority for you.' : prefs.parksNeed === 'high' && groups.parks === 0 ? ' — this is a mismatch for your needs.' : '.'}` },
        fuel: { score: fuelScore, reason: `${groups.fuel} fuel stations nearby.` }
    };

    // Weighted overall score by importance of each category
    const weights = {
        food: prefs.eatOut === 'often' ? 1.0 : prefs.eatOut === 'sometimes' ? 0.7 : 0.3,
        groceries: prefs.groceries === 'daily' ? 1.0 : prefs.groceries === 'few_times_week' ? 0.8 : prefs.groceries === 'weekly' ? 0.6 : 0.3,
        parks: prefs.parksNeed === 'high' ? 0.9 : prefs.parksNeed === 'medium' ? 0.6 : 0.2,
        fuel: 0.4
    };
    const weightedSum = foodScore * weights.food + groceriesScore * weights.groceries + parksScore * weights.parks + fuelScore * weights.fuel;
    const weightTotal = weights.food + weights.groceries + weights.parks + weights.fuel;
    const overallScore = clamp(weightedSum / weightTotal);

    let verdict = 'neutral';
    if (overallScore >= 8) verdict = 'great';
    else if (overallScore >= 6) verdict = 'good';
    else if (overallScore <= 3) verdict = 'poor';

    const summary = personalizeSummary(baseSummary, {
        restaurant: groups.food,
        cafe: 0,
        fast_food: 0,
        supermarket: groups.groceries,
        park: groups.parks,
        fuel: groups.fuel
    }, preferences);

    return {
        summary,
        verdict,
        overallScore,
        ratings
    };
}

// Route: get coordinates from address
app.get('/geocode', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'Address is required' });

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: address,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'Neighborhood-App'
            }
        });

        if (response.data.length === 0) return res.status(404).json({ error: 'Address not found' });
        const { lat, lon } = response.data[0];
        res.json({ lat, lon });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route: get nearby specific POIs using Overpass API
app.get('/nearby', async (req, res) => {
    const { lat, lon, radius = 1500 } = req.query; // default 300 meters
    if (!lat || !lon) return res.status(400).json({ error: 'Lat and Lon are required' });

    const query = `
      [out:json][timeout:25];
      (
        // Restaurants, cafes, fast food, fuel, and marketplaces (amenity)
        node(around:${radius},${lat},${lon})[amenity~"^(restaurant|fast_food|cafe|fuel|food_court|ice_cream|marketplace)$"];
        way(around:${radius},${lat},${lon})[amenity~"^(restaurant|fast_food|cafe|fuel|food_court|ice_cream|marketplace)$"];
        relation(around:${radius},${lat},${lon})[amenity~"^(restaurant|fast_food|cafe|fuel|food_court|ice_cream|marketplace)$"];

        // Public parks and similar leisure areas
        node(around:${radius},${lat},${lon})[leisure~"^(park|garden|recreation_ground|common|nature_reserve)$"];
        way(around:${radius},${lat},${lon})[leisure~"^(park|garden|recreation_ground|common|nature_reserve)$"];
        relation(around:${radius},${lat},${lon})[leisure~"^(park|garden|recreation_ground|common|nature_reserve)$"];

        // Grocery-related shops
        node(around:${radius},${lat},${lon})[shop~"^(supermarket|hypermarket|convenience|greengrocer|butcher|bakery|grocery|deli|farm|organic|health_food|cheese|beverages)$"];
        way(around:${radius},${lat},${lon})[shop~"^(supermarket|hypermarket|convenience|greengrocer|butcher|bakery|grocery|deli|farm|organic|health_food|cheese|beverages)$"];
        relation(around:${radius},${lat},${lon})[shop~"^(supermarket|hypermarket|convenience|greengrocer|butcher|bakery|grocery|deli|farm|organic|health_food|cheese|beverages)$"];
      );
      out center;
    `;

    try {
        const response = await axios.post(
            'https://overpass-api.de/api/interpreter',
            query,
            { headers: { 'Content-Type': 'text/plain' } }
        );
        const results = response.data.elements.map(el => {
            const tags = el.tags || {};

            // Determine category with broader fallback
            let category = null;
            if (tags.amenity && tags.amenity !== 'yes') category = tags.amenity;
            else if (tags.shop && tags.shop !== 'yes') category = tags.shop;
            else if (tags.leisure && tags.leisure !== 'yes') category = tags.leisure;
            else if (tags.tourism && tags.tourism !== 'yes') category = tags.tourism;
            else if (tags.building && tags.building !== 'yes') category = tags.building;

            // Determine display name with multilingual and brand/operator fallback
            let name = null;
            if (tags.name) name = tags.name;
            else {
              // Check for any localized name like name:en, name:ro
              const localized = Object.keys(tags).find(k => k.startsWith('name:'));
              if (localized) name = tags[localized];
            }
            if (!name && tags.brand) name = tags.brand;
            if (!name && tags.operator) name = tags.operator;
            if (!name && category) name = category;
            if (!name) name = 'Unknown';

            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;
            if (!lat || !lon) return null;

            return {
              id: el.id,
              type: el.type,
              lat,
              lon,
              name,
              category
            };
          }).filter(Boolean);
          
          res.json(results);
          
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Optional: summarize nearby places using OpenAI if API key provided, otherwise fallback structured summary
app.post('/summarize', async (req, res) => {
    try {
        const { facilities = [], address = '', radius, preferences = {} } = req.body || {};
        const counts = facilities.reduce((acc, f) => {
            const key = f.category || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const topCategories = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, v]) => `${k} (${v})`) 
            .join(', ');

        const groupCounts = {
            food: ['restaurant','fast_food','food_court','cafe','ice_cream'].reduce((s,k)=>s+(counts[k]||0),0),
            groceries: ['supermarket','hypermarket','convenience','greengrocer','butcher','bakery','grocery','deli','farm','organic','health_food','cheese','beverages'].reduce((s,k)=>s+(counts[k]||0),0),
            parks: ['park','garden','recreation_ground','common','nature_reserve'].reduce((s,k)=>s+(counts[k]||0),0),
            fuel: (counts['fuel']||0)
        };

        const prompt = `Given a user's preferences ${JSON.stringify(preferences)}, an address "${address}", a radius of ${radius} meters, and amenity counts ${JSON.stringify(groupCounts)}, produce a JSON object only (no extra text) with this exact shape: {"summary": string, "verdict": string, "overallScore": integer, "ratings": {"food": {"score": number, "reason": string}, "groceries": {"score": number, "reason": string}, "parks": {"score": number, "reason": string}, "fuel": {"score": number, "reason": string}}}. Scores are 0-10 integers. Keep it concise but specific.`;

        if (OPENAI_API_KEY) {
            try {
                const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'You output strictly valid minified JSON only.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 240
                }, {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                const text = resp.data?.choices?.[0]?.message?.content?.trim();
                let parsed;
                try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
                if (parsed && parsed.ratings) {
                    return res.json(parsed);
                }
                const base = buildHeuristicSummary(counts, address, radius);
                const personalized = buildHeuristicRatings(groupCounts, preferences, base);
                return res.json(personalized);
            } catch (err) {
                console.error('OpenAI summarize failed:', err.response?.data || err.message);
                const base = buildHeuristicSummary(counts, address, radius);
                const personalized = buildHeuristicRatings(groupCounts, preferences, base);
                return res.json({ ...personalized, provider: 'fallback' });
            }
        }

        // Fallback heuristic summary when no API key
        const base = buildHeuristicSummary(counts, address, radius);
        const personalized = buildHeuristicRatings(groupCounts, preferences, base);
        return res.json(personalized);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
