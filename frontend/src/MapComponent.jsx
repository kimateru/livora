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
						icon={defaultIcon}
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
