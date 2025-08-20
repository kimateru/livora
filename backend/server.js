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


// Optional: summarize nearby places using OpenAI if API key provided, otherwise fallback simple summary
app.post('/summarize', async (req, res) => {
    try {
        const { facilities = [], address = '', radius } = req.body || {};
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

        const prompt = `Summarize the neighborhood amenities around the address "${address}" within ${radius || 'the specified'} meters. Focus on convenience and vibe. Data categories and counts: ${JSON.stringify(counts)}.`;

        if (OPENAI_API_KEY) {
            try {
                const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'You are a concise neighborhood summarizer. One or two sentences max.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.6,
                    max_tokens: 120
                }, {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                const text = resp.data?.choices?.[0]?.message?.content?.trim();
                return res.json({ summary: text || `Within ${radius}m: ${topCategories}.` });
            } catch (err) {
                console.error('OpenAI summarize failed:', err.response?.data || err.message);
                const summary = buildHeuristicSummary(counts, address, radius);
                return res.json({ summary, provider: 'fallback' });
            }
        }

        // Fallback heuristic summary when no API key
        const summary = buildHeuristicSummary(counts, address, radius);
        return res.json({ summary });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
