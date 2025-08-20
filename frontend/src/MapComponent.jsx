import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import marker1x from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

const defaultIcon = new L.Icon({
	iconRetinaUrl: marker2x,
	iconUrl: marker1x,
	shadowUrl: shadow,
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41]
});

// Create simple emoji-based icons so we don't need external image assets
const iconCache = new Map();
function typeFromCategory(category) {
	const value = String(category || '').toLowerCase();
	if ([
		'supermarket','hypermarket','convenience','greengrocer','butcher','bakery','grocery','deli','farm','organic','health_food','cheese','beverages'
	].includes(value)) return 'grocery';
	if (value === 'restaurant') return 'restaurant';
	if (value === 'fast_food') return 'fast_food';
	if (value === 'cafe') return 'cafe';
	if (value === 'fuel') return 'fuel';
	if (['park','garden','recreation_ground','common','nature_reserve'].includes(value)) return 'park';
	if (value === 'marketplace') return 'market';
	return 'other';
}

function createEmojiIcon(emoji, backgroundColor) {
	return L.divIcon({
		className: 'emoji-marker',
		html: `<div class="emoji-pin"><span class="emoji">${emoji}</span></div>`,
		iconSize: [30, 30],
		iconAnchor: [15, 30],
		popupAnchor: [0, -28]
	});
}

function getIconForCategory(category) {
	const type = typeFromCategory(category);
	if (iconCache.has(type)) return iconCache.get(type);
	let spec = { emoji: '📍' };
	switch (type) {
		case 'grocery': spec = { emoji: '🛒' }; break;
		case 'restaurant': spec = { emoji: '🍽️' }; break;
		case 'cafe': spec = { emoji: '☕' }; break;
		case 'fast_food': spec = { emoji: '🍔' }; break;
		case 'fuel': spec = { emoji: '⛽' }; break;
		case 'park': spec = { emoji: '🌳' }; break;
		case 'market': spec = { emoji: '🧺' }; break;
		default: break;
	}
	const icon = createEmojiIcon(spec.emoji);
	iconCache.set(type, icon);
	return icon;
}

function MapComponent({ facilities, center }) {
	const mapCenter = Array.isArray(center)
		? [parseFloat(center[0]), parseFloat(center[1])]
		: [parseFloat(center.lat), parseFloat(center.lon)];
	return (
		<MapContainer center={mapCenter} zoom={16} scrollWheelZoom={false} style={{ height: '500px', width: '100%' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {facilities.map(f => (
				f.lat && f.lon ? (
					<Marker
						key={f.id}
						position={[parseFloat(f.lat), parseFloat(f.lon)]}
						icon={getIconForCategory(f.category) || defaultIcon}
					>
						<Popup>
							<strong>{(f.name && String(f.name).trim()) ? f.name : 'Unknown'}</strong> <br />
							Type: {(f.category && String(f.category).trim()) ? f.category : 'N/A'}
						</Popup>
					</Marker>
				) : null
			))}

        </MapContainer>
	);
}

export default MapComponent;
