const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

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


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
