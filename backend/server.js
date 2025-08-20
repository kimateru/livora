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

// Route: get nearby POIs using Overpass API
// Route: get nearby specific POIs using Overpass API
app.get('/nearby', async (req, res) => {
    const { lat, lon, radius = 100 } = req.query; // default 300 meters
    if (!lat || !lon) return res.status(400).json({ error: 'Lat and Lon are required' });

    const query = `
      [out:json];
      (
       (
  node(around:${radius},${lat},${lon})[amenity~"^(hospital|clinic|park|fuel)$"][amenity!="bench"];
  node(around:${radius},${lat},${lon})[shop~"^(supermarket|convenience|greengrocer|butcher|bakery|food|cheese|beverages)$"][amenity!="bench"];
  
  way(around:${radius},${lat},${lon})[amenity~"^(hospital|clinic|park|fuel)$"];
  way(around:${radius},${lat},${lon})[shop~"^(supermarket|convenience|greengrocer|butcher|bakery|food|cheese|beverages)$"];
  
  relation(around:${radius},${lat},${lon})[amenity~"^(hospital|clinic|park|fuel)$"];
  relation(around:${radius},${lat},${lon})[shop~"^(supermarket|convenience|greengrocer|butcher|bakery|food|cheese|beverages)$"];
);
out center;


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
            // Determine category
            let category = null;
            if (el.tags?.amenity) category = el.tags.amenity;
            else if (el.tags?.shop) category = el.tags.shop;
          
            // Determine display name
            let name = el.tags?.name || category || 'Unknown';
          
            let lat = el.lat || el.center?.lat;
            let lon = el.lon || el.center?.lon;
          
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
