// Simple local dev server for testing the API
// Run with: node server.js

import http from 'http';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FEED_URLS = [
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si',
];

const STATIONS_URL = 'http://web.mta.info/developers/data/nyct/subway/Stations.csv';

// Stop ID to coordinates mapping
let stopsMap = new Map();
let stopsLoaded = false;

// Load stations data
async function loadStations() {
  if (stopsLoaded) return;

  try {
    console.log('Loading stations data...');
    const response = await fetch(STATIONS_URL);
    const csv = await response.text();
    const lines = csv.split('\n');

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse CSV (handle potential commas in station names)
      const parts = line.split(',');
      const gtfsStopId = parts[2]; // GTFS Stop ID column
      const lat = parseFloat(parts[9]); // GTFS Latitude
      const lng = parseFloat(parts[10]); // GTFS Longitude

      if (gtfsStopId && !isNaN(lat) && !isNaN(lng)) {
        // Store base stop ID
        stopsMap.set(gtfsStopId, { lat, lng });
        // Also store with N/S suffixes (for direction)
        stopsMap.set(gtfsStopId + 'N', { lat, lng });
        stopsMap.set(gtfsStopId + 'S', { lat, lng });
      }
    }

    stopsLoaded = true;
    console.log(`Loaded ${stopsMap.size} stop locations`);
  } catch (error) {
    console.error('Failed to load stations:', error);
  }
}

// Also load the full stops.txt for more complete coverage
async function loadGtfsStops() {
  try {
    const response = await fetch('https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l');
    // We can't easily get stops.txt from the API, so we'll use a fallback approach
  } catch (error) {
    // Ignore
  }
}

let cachedTrains = [];
let cachedAlerts = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

const ALERT_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json"

async function fetchAlerts(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch alerts: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const alerts = [];

    if (data.entity) {
      for (const entity of data.entity) {
        if (entity.alert) {
          const alert = entity.alert;

          // Extract route IDs
          const routeIds = [];
          if (alert.informed_entity) {
            for (const informed of alert.informed_entity) {
              if (informed.route_id && !routeIds.includes(informed.route_id)) {
                routeIds.push(informed.route_id);
              }
            }
          }

          // Extract header text
          let headerText = '';
          if (alert.header_text?.translation) {
            const translation = alert.header_text.translation.find(t => t.language === 'en')
              || alert.header_text.translation[0];
            headerText = translation?.text || '';
          }

          // Extract description text
          let descriptionText = '';
          if (alert.description_text?.translation) {
            const translation = alert.description_text.translation.find(t => t.language === 'en')
              || alert.description_text.translation[0];
            descriptionText = translation?.text || '';
          }

          if (routeIds.length > 0 && headerText) {
            alerts.push({
              id: entity.id,
              routeIds,
              headerText,
              descriptionText,
            });
          }
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return [];
  }
}

async function fetchFeed(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return [];
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    const trains = [];

    for (const entity of feed.entity) {
      // Check for vehicle entity with trip info
      if (entity.vehicle?.trip?.routeId && entity.vehicle?.stopId) {
        const vehicle = entity.vehicle;
        const stopId = vehicle.stopId;

        // Look up stop coordinates
        let stopCoords = stopsMap.get(stopId);
        if (!stopCoords) {
          // Try without direction suffix
          const baseStopId = stopId.replace(/[NS]$/, '');
          stopCoords = stopsMap.get(baseStopId);
          if (!stopCoords) continue;
        }

        // Determine status
        let status = 'IN_TRANSIT';
        const currentStatus = vehicle.currentStatus;
        if (currentStatus === 1 || currentStatus === 'STOPPED_AT') {
          status = 'STOPPED';
        } else if (currentStatus === 2 || currentStatus === 'INCOMING_AT') {
          status = 'INCOMING';
        }

        trains.push({
          id: entity.id,
          routeId: vehicle.trip.routeId,
          latitude: stopCoords.lat,
          longitude: stopCoords.lng,
          tripId: vehicle.trip.tripId || entity.id,
          status,
          currentStopId: stopId,
          timestamp: Number(vehicle.timestamp || feed.header.timestamp),
        });
      }
    }

    return trains;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return [];
  }
}

async function getAllData() {
  // Ensure stations are loaded
  await loadStations();

  const now = Date.now();

  if (cachedTrains.length > 0 && now - lastFetchTime < CACHE_DURATION) {
    return { trains: cachedTrains, alerts: cachedAlerts };
  }

  console.log('Fetching fresh data from MTA...');
  const [trainResults, alerts] = await Promise.all([
    Promise.all(FEED_URLS.map(fetchFeed)),
    fetchAlerts(ALERT_URL),
  ]);

  cachedTrains = trainResults.flat();
  cachedAlerts = alerts;
  lastFetchTime = now;
  console.log(`Got ${cachedTrains.length} trains and ${cachedAlerts.length} alerts`);

  return { trains: cachedTrains, alerts: cachedAlerts };
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/trains' && req.method === 'GET') {
    try {
      const data = await getAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch train data' }));
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 3001;

// Pre-load stations before starting server
loadStations().then(() => {
  server.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log(`  GET http://localhost:${PORT}/api/trains`);
  });
});
