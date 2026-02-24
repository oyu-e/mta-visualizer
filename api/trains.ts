// Vercel Serverless Function - Proxy for MTA GTFS-RT feeds
// This parses the protobuf data and returns JSON

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

const ALERT_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json"

interface Train {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  tripId: string;
  status: 'IN_TRANSIT' | 'STOPPED' | 'INCOMING';
  currentStopId?: string;
  timestamp: number;
}

interface Alert {
  id: string;
  routeIds: string[];
  headerText: string;
  descriptionText: string;
  activePeriodStart?: number;
  activePeriodEnd?: number;
}

interface AlertsResponse {
  alerts: Alert[];
  timestamp: number;
}

// Cache to avoid hammering the MTA API
let cachedTrains: Train[] = [];
let cachedAlerts: Alert[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

async function fetchAlerts(url: string): Promise<Alert[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch alerts: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const alerts: Alert[] = [];

    // Parse MTA alerts JSON structure
    if (data.entity) {
      for (const entity of data.entity) {
        if (entity.alert) {
          const alert = entity.alert;

          // Extract route IDs from informed_entity
          const routeIds: string[] = [];
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
            const translation = alert.header_text.translation.find(
              (t: { language: string }) => t.language === 'en'
            ) || alert.header_text.translation[0];
            headerText = translation?.text || '';
          }

          // Extract description text
          let descriptionText = '';
          if (alert.description_text?.translation) {
            const translation = alert.description_text.translation.find(
              (t: { language: string }) => t.language === 'en'
            ) || alert.description_text.translation[0];
            descriptionText = translation?.text || '';
          }

          // Extract active period
          let activePeriodStart: number | undefined;
          let activePeriodEnd: number | undefined;
          if (alert.active_period && alert.active_period.length > 0) {
            activePeriodStart = alert.active_period[0].start;
            activePeriodEnd = alert.active_period[0].end;
          }

          if (routeIds.length > 0 && headerText) {
            alerts.push({
              id: entity.id,
              routeIds,
              headerText,
              descriptionText,
              activePeriodStart,
              activePeriodEnd,
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

async function fetchFeed(url: string): Promise<Train[]> {
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

    const trains: Train[] = [];

    for (const entity of feed.entity) {
      if (entity.vehicle?.position && entity.vehicle?.trip?.routeId) {
        const vehicle = entity.vehicle;
        const position = vehicle.position;

        // Determine status
        let status: Train['status'] = 'IN_TRANSIT';
        if (vehicle.currentStatus === 1) {
          status = 'STOPPED';
        } else if (vehicle.currentStatus === 2) {
          status = 'INCOMING';
        }

        trains.push({
          id: entity.id,
          routeId: vehicle.trip.routeId,
          latitude: position.latitude,
          longitude: position.longitude,
          bearing: position.bearing ?? undefined,
          tripId: vehicle.trip.tripId || entity.id,
          status,
          currentStopId: vehicle.stopId ?? undefined,
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

async function getAllData(): Promise<{ trains: Train[]; alerts: Alert[] }> {
  const now = Date.now();

  // Return cached data if fresh enough
  if (cachedTrains.length > 0 && now - lastFetchTime < CACHE_DURATION) {
    return { trains: cachedTrains, alerts: cachedAlerts };
  }

  // Fetch trains and alerts in parallel
  const [trainResults, alerts] = await Promise.all([
    Promise.all(FEED_URLS.map(fetchFeed)),
    fetchAlerts(ALERT_URL),
  ]);

  cachedTrains = trainResults.flat();
  cachedAlerts = alerts;
  lastFetchTime = now;

  return { trains: cachedTrains, alerts: cachedAlerts };
}

// Vercel serverless handler
export default async function handler(
  req: { method: string },
  res: {
    status: (code: number) => { json: (data: unknown) => void; end: () => void };
    setHeader: (name: string, value: string) => void;
  }
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const data = await getAllData();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error in trains handler:', error);
    res.status(500).json({ error: 'Failed to fetch train data' });
  }
}
