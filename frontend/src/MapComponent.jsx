import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapComponent({ facilities, center }) {
    return (
        <MapContainer center={center} zoom={16} scrollWheelZoom={false} style={{ height: '500px', width: '100%' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {facilities.map(f => (
                f.lat && f.lon ? (
                    <Marker key={f.id} position={[f.lat, f.lon]}>
                        <Popup>
                            <strong>{f.name}</strong> <br />
                            Type: {f.category}
                        </Popup>
                    </Marker>
                ) : null
            ))}

        </MapContainer>
    );
}

export default MapComponent;
