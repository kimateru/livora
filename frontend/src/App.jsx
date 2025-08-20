import { useState } from 'react';
import MapComponent from './MapComponent';

function App() {
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [places, setPlaces] = useState([]);

  const handleSearch = async () => {
    // 1. Get coordinates
    const geoRes = await fetch(`http://localhost:5000/geocode?address=${encodeURIComponent(address)}`);
    const geoData = await geoRes.json();
    setCoords(geoData);

    // 2. Get nearby places
    const nearbyRes = await fetch(`http://localhost:5000/nearby?lat=${geoData.lat}&lon=${geoData.lon}&radius=300`);
    const nearbyData = await nearbyRes.json();
    // Count facilities per category
    const counts = {};
    nearbyData.forEach(f => {
      if (!f.category) return;
      counts[f.category] = (counts[f.category] || 0) + 1;
    });

    setPlaces(nearbyData);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" />
      <button onClick={handleSearch}>Search</button>

      {coords && <MapComponent facilities={places.filter(f => f.lat && f.lon)} center={coords} />}
    </div>

  );
}

export default App;