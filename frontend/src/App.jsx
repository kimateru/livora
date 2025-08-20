import { useState } from 'react';
import MapComponent from './MapComponent';

function App() {
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [radius, setRadius] = useState(1500);

  const handleSearch = async () => {
    setError(null);
    setLoading(true);
    setPlaces([]);
    setCoords(null);
    try {
      // 1. Get coordinates
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      if (!geoRes.ok) {
        const errText = geoRes.status === 404 ? 'Address not found' : 'Failed to geocode address';
        throw new Error(errText);
      }
      const geoData = await geoRes.json();
      const lat = parseFloat(geoData.lat);
      const lon = parseFloat(geoData.lon);
      setCoords([lat, lon]);

      // 2. Get nearby places
      const nearbyRes = await fetch(`/api/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
      if (!nearbyRes.ok) {
        throw new Error('Failed to fetch nearby places');
      }
      const nearbyData = await nearbyRes.json();
      setPlaces(nearbyData);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" />
      <input
        type="number"
        value={radius}
        onChange={(e) => setRadius(Number(e.target.value) || 0)}
        min={100}
        step={50}
        style={{ marginLeft: '0.5rem', width: '7rem' }}
        placeholder="Radius (m)"
      />
      <button onClick={handleSearch} disabled={loading || !address.trim() || radius <= 0} style={{ marginLeft: '0.5rem' }}>
        {loading ? 'Searching…' : 'Search'}
      </button>
      {error && <div style={{ color: 'red', marginTop: '0.5rem' }}>{error}</div>}

      {coords && <MapComponent facilities={places.filter(f => f.lat && f.lon)} center={coords} />}
    </div>

  );
}

export default App;