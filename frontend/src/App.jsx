import { useState } from 'react';
import MapComponent from './MapComponent';

function App() {
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [radius, setRadius] = useState(1500);
  const [summary, setSummary] = useState('');
  const [prefs, setPrefs] = useState({
    stayType: 'live', // 'live' or 'travel'
    eatOut: 'sometimes', // 'rarely' | 'sometimes' | 'often'
    groceries: 'weekly', // 'daily' | 'few_times_week' | 'weekly' | 'rarely'
    parksNeed: 'medium' // 'low' | 'medium' | 'high'
  });

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

      // 3. Ask backend to summarize
      try {
        const sumRes = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facilities: nearbyData, address, radius, preferences: prefs })
        });
        if (sumRes.ok) {
          const sumData = await sumRes.json();
          if (sumData && sumData.ratings) {
            setSummary(sumData); // structured response
          } else {
            setSummary(sumData.summary || '');
          }
        } else {
          const text = await sumRes.text();
          console.error('Summarize error:', text);
          setSummary('');
        }
      } catch (_) {
        console.error('Summarize request failed');
        setSummary('');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      {/* Preferences */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <label>
          <div style={{ fontSize: 12, color: '#555' }}>Are you planning to live here or travel?</div>
          <select value={prefs.stayType} onChange={(e) => setPrefs(prev => ({ ...prev, stayType: e.target.value }))}>
            <option value="live">Live</option>
            <option value="travel">Travel</option>
          </select>
        </label>
        <label>
          <div style={{ fontSize: 12, color: '#555' }}>How often do you eat out (restaurants/cafes)?</div>
          <select value={prefs.eatOut} onChange={(e) => setPrefs(prev => ({ ...prev, eatOut: e.target.value }))}>
            <option value="rarely">Rarely</option>
            <option value="sometimes">Sometimes</option>
            <option value="often">Often</option>
          </select>
        </label>
        <label>
          <div style={{ fontSize: 12, color: '#555' }}>How often do you buy groceries?</div>
          <select value={prefs.groceries} onChange={(e) => setPrefs(prev => ({ ...prev, groceries: e.target.value }))}>
            <option value="daily">Daily</option>
            <option value="few_times_week">Few times/week</option>
            <option value="weekly">Weekly</option>
            <option value="rarely">Rarely</option>
          </select>
        </label>
        <label>
          <div style={{ fontSize: 12, color: '#555' }}>Need for parks (pets/kids)?</div>
          <select value={prefs.parksNeed} onChange={(e) => setPrefs(prev => ({ ...prev, parksNeed: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {/* Address + radius */}
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
      {summary && typeof summary === 'string' && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
          {summary}
        </div>
      )}
      {summary && typeof summary === 'object' && (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
          <div style={{ marginBottom: 8 }}><strong>Overall</strong>: {summary.verdict} — {summary.overallScore}/10</div>
          {Object.entries(summary.ratings).map(([key, val]) => {
            const score = Math.max(0, Math.min(10, Math.round(val.score)));
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ textTransform: 'capitalize' }}>{key}</span>
                  <span>{score}/10</span>
                </div>
                <div style={{ display: 'flex', gap: 4, margin: '4px 0' }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: i < score ? '#10b981' : '#e5e7eb', border: '1px solid #d1d5db' }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>{val.reason}</div>
              </div>
            );
          })}
          {/* <div style={{ marginTop: 8 }}>{summary.summary}</div> */}
        </div>
      )}
    </div>

  );
}

export default App;