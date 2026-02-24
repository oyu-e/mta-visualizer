import { useEffect, useRef, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTrainPositions } from '../hooks/useTrainPositions';
import { useTrainStore, LINE_GROUPS } from '../store/trainStore';
import { LINE_COLORS } from '../data/lines';
import { AlertPanel } from './AlertPanel';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const NYC_CENTER: [number, number] = [-73.985, 40.748];
const NYC_ZOOM = 11.5;

// Animation duration for transitions (ms)
const ANIMATION_DURATION = 4000;

// Route color mapping for the lines layer
const ROUTE_COLORS: Record<string, string> = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45',
  'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'S': '#808183', 'GS': '#808183', 'FS': '#808183', 'H': '#808183', 'SI': '#0039A6',
};

// Easing function for smooth animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Calculate distance between two points
function distance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Find the nearest point on a polyline to a given point
function nearestPointOnLine(
  point: [number, number],
  line: [number, number][]
): { point: [number, number]; index: number; t: number } {
  let nearestDist = Infinity;
  let nearestPoint: [number, number] = point;
  let nearestIndex = 0;
  let nearestT = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];

    // Vector from a to b
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];

    // Vector from a to point
    const apx = point[0] - a[0];
    const apy = point[1] - a[1];

    // Project point onto line segment
    const abLen2 = abx * abx + aby * aby;
    let t = abLen2 > 0 ? (apx * abx + apy * aby) / abLen2 : 0;
    t = Math.max(0, Math.min(1, t));

    const projX = a[0] + t * abx;
    const projY = a[1] + t * aby;

    const dist = distance(point, [projX, projY]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPoint = [projX, projY];
      nearestIndex = i;
      nearestT = t;
    }
  }

  return { point: nearestPoint, index: nearestIndex, t: nearestT };
}

// Get a point along a polyline at a given distance ratio (0-1)
function pointAlongLine(
  line: [number, number][],
  startIndex: number,
  startT: number,
  endIndex: number,
  endT: number,
  progress: number
): [number, number] {
  // Calculate total distance along path
  let totalDist = 0;
  const segments: { start: [number, number]; end: [number, number]; dist: number }[] = [];

  // First partial segment
  const startPoint: [number, number] = [
    line[startIndex][0] + startT * (line[startIndex + 1][0] - line[startIndex][0]),
    line[startIndex][1] + startT * (line[startIndex + 1][1] - line[startIndex][1])
  ];

  if (startIndex === endIndex) {
    // Same segment, interpolate directly
    const endPoint: [number, number] = [
      line[endIndex][0] + endT * (line[endIndex + 1][0] - line[endIndex][0]),
      line[endIndex][1] + endT * (line[endIndex + 1][1] - line[endIndex][1])
    ];
    return [
      startPoint[0] + progress * (endPoint[0] - startPoint[0]),
      startPoint[1] + progress * (endPoint[1] - startPoint[1])
    ];
  }

  // Determine direction
  const forward = endIndex > startIndex || (endIndex === startIndex && endT > startT);

  if (forward) {
    // First partial segment to end of startIndex segment
    const firstEnd = line[startIndex + 1];
    segments.push({ start: startPoint, end: firstEnd, dist: distance(startPoint, firstEnd) });
    totalDist += segments[segments.length - 1].dist;

    // Full segments in between
    for (let i = startIndex + 1; i < endIndex; i++) {
      const segDist = distance(line[i], line[i + 1]);
      segments.push({ start: line[i], end: line[i + 1], dist: segDist });
      totalDist += segDist;
    }

    // Last partial segment
    const endPoint: [number, number] = [
      line[endIndex][0] + endT * (line[endIndex + 1][0] - line[endIndex][0]),
      line[endIndex][1] + endT * (line[endIndex + 1][1] - line[endIndex][1])
    ];
    segments.push({ start: line[endIndex], end: endPoint, dist: distance(line[endIndex], endPoint) });
    totalDist += segments[segments.length - 1].dist;
  } else {
    // Going backward - reverse logic
    // First partial segment going backward
    const firstEnd = line[startIndex];
    segments.push({ start: startPoint, end: firstEnd, dist: distance(startPoint, firstEnd) });
    totalDist += segments[segments.length - 1].dist;

    // Full segments going backward
    for (let i = startIndex - 1; i > endIndex; i--) {
      const segDist = distance(line[i + 1], line[i]);
      segments.push({ start: line[i + 1], end: line[i], dist: segDist });
      totalDist += segDist;
    }

    // Last partial segment
    const endPoint: [number, number] = [
      line[endIndex][0] + endT * (line[endIndex + 1][0] - line[endIndex][0]),
      line[endIndex][1] + endT * (line[endIndex + 1][1] - line[endIndex][1])
    ];
    segments.push({ start: line[endIndex + 1], end: endPoint, dist: distance(line[endIndex + 1], endPoint) });
    totalDist += segments[segments.length - 1].dist;
  }

  // Find point at progress along total distance
  const targetDist = progress * totalDist;
  let accumulated = 0;

  for (const seg of segments) {
    if (accumulated + seg.dist >= targetDist) {
      const segProgress = seg.dist > 0 ? (targetDist - accumulated) / seg.dist : 0;
      return [
        seg.start[0] + segProgress * (seg.end[0] - seg.start[0]),
        seg.start[1] + segProgress * (seg.end[1] - seg.start[1])
      ];
    }
    accumulated += seg.dist;
  }

  // Return end point
  const lastSeg = segments[segments.length - 1];
  return lastSeg ? lastSeg.end : startPoint;
}

// Calculate bearing between two points
function calculateBearing(from: [number, number], to: [number, number]): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  // Convert to degrees, where 0 = north, 90 = east
  const angle = Math.atan2(dx, dy) * (180 / Math.PI);
  return angle;
}

// Get direction from stop ID suffix
function getDirectionFromStopId(stopId: string | undefined): 'N' | 'S' | null {
  if (!stopId) return null;
  const suffix = stopId.slice(-1);
  if (suffix === 'N' || suffix === 'S') return suffix;
  return null;
}

// Track animation state for each train
interface TrainAnimation {
  startPos: [number, number];
  endPos: [number, number];
  startTime: number;
  routeId: string;
  // Path info for following the track
  path?: [number, number][];
  startIndex?: number;
  startT?: number;
  endIndex?: number;
  endT?: number;
}

// Route paths storage
type RoutePaths = Map<string, [number, number][][]>;

export function SubwayMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const animationRef = useRef<number | null>(null);
  const trainAnimations = useRef<Map<string, TrainAnimation>>(new Map());
  const currentPositions = useRef<Map<string, [number, number]>>(new Map());
  const routePaths = useRef<RoutePaths>(new Map());
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  const { trains, alerts, lastUpdated, isLoading, error } = useTrainPositions();
  const { activeLines, toggleLine, showAllLines } = useTrainStore();

  // Filter trains based on active lines
  const filteredTrains = activeLines === null
    ? trains
    : trains.filter(t => activeLines.has(t.routeId));

  // Find the best path segment for a route between two points
  const findPathBetweenPoints = useCallback((
    routeId: string,
    start: [number, number],
    end: [number, number]
  ): { path: [number, number][]; startIndex: number; startT: number; endIndex: number; endT: number } | null => {
    const paths = routePaths.current.get(routeId);
    if (!paths || paths.length === 0) return null;

    // Find the path that contains both points (closest to both)
    let bestPath: [number, number][] | null = null;
    let bestStartInfo = { index: 0, t: 0, dist: Infinity };
    let bestEndInfo = { index: 0, t: 0, dist: Infinity };

    for (const path of paths) {
      if (path.length < 2) continue;

      const startNearest = nearestPointOnLine(start, path);
      const endNearest = nearestPointOnLine(end, path);

      const startDist = distance(start, startNearest.point);
      const endDist = distance(end, endNearest.point);
      const totalDist = startDist + endDist;

      if (totalDist < bestStartInfo.dist + bestEndInfo.dist) {
        bestPath = path;
        bestStartInfo = { index: startNearest.index, t: startNearest.t, dist: startDist };
        bestEndInfo = { index: endNearest.index, t: endNearest.t, dist: endDist };
      }
    }

    // Only use path if both points are reasonably close to it
    if (bestPath && bestStartInfo.dist < 0.005 && bestEndInfo.dist < 0.005) {
      return {
        path: bestPath,
        startIndex: bestStartInfo.index,
        startT: bestStartInfo.t,
        endIndex: bestEndInfo.index,
        endT: bestEndInfo.t
      };
    }

    return null;
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: NYC_CENTER,
      zoom: NYC_ZOOM,
      antialias: true,
    });

    const m = map.current;

    m.on('load', async () => {
      // Darken the map significantly
      m.setPaintProperty('water', 'fill-color', '#050508');

      // Try to darken land/background
      try {
        m.setPaintProperty('land', 'background-color', '#0a0a0f');
      } catch {
        // Layer might not exist
      }

      // Load subway lines GeoJSON
      try {
        const response = await fetch('/subway-lines.geojson');
        const linesData = await response.json();

        // Extract route paths for animation
        for (const feature of linesData.features) {
          const route = feature.properties.route;
          if (!routePaths.current.has(route)) {
            routePaths.current.set(route, []);
          }

          // MultiLineString has multiple line arrays
          if (feature.geometry.type === 'MultiLineString') {
            for (const line of feature.geometry.coordinates) {
              routePaths.current.get(route)!.push(line as [number, number][]);
            }
          } else if (feature.geometry.type === 'LineString') {
            routePaths.current.get(route)!.push(feature.geometry.coordinates as [number, number][]);
          }
        }

        // Add subway lines source
        m.addSource('subway-lines', {
          type: 'geojson',
          data: linesData
        });

        // Subway lines - outer glow
        m.addLayer({
          id: 'subway-lines-glow',
          type: 'line',
          source: 'subway-lines',
          paint: {
            'line-color': [
              'match', ['get', 'route'],
              ...Object.entries(ROUTE_COLORS).flat(),
              '#808080'
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 4,
              14, 8,
              18, 12
            ],
            'line-opacity': 0.15,
            'line-blur': 3
          }
        });

        // Subway lines - main line
        m.addLayer({
          id: 'subway-lines-main',
          type: 'line',
          source: 'subway-lines',
          paint: {
            'line-color': [
              'match', ['get', 'route'],
              ...Object.entries(ROUTE_COLORS).flat(),
              '#808080'
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 1.5,
              14, 2.5,
              18, 4
            ],
            'line-opacity': 0.6
          }
        });

        setLinesLoaded(true);
      } catch (err) {
        console.error('Failed to load subway lines:', err);
      }

      // Add GeoJSON source for trains
      m.addSource('trains', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Outer glow layer
      m.addLayer({
        id: 'trains-glow-outer',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 14, 18, 24],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.2,
          'circle-blur': 1
        }
      });

      // Middle glow layer
      m.addLayer({
        id: 'trains-glow-middle',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8, 18, 14],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.5,
          'circle-blur': 0.4
        }
      });

      // Core layer
      m.addLayer({
        id: 'trains-core',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 4, 18, 6],
          'circle-color': ['get', 'color'],
          'circle-opacity': 1,
        }
      });

      // Center dot
      m.addLayer({
        id: 'trains-center',
        type: 'circle',
        source: 'trains',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 2, 18, 3],
          'circle-color': '#ffffff',
          'circle-opacity': 1,
        }
      });

      // Direction indicator - a simple triangle/chevron that follows the track
      // Offset perpendicular to travel direction so overlapping trains spread out
      m.addLayer({
        id: 'trains-direction',
        type: 'symbol',
        source: 'trains',
        layout: {
          'text-field': '▶',
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 12, 18, 16],
          'text-rotate': ['get', 'bearing'],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          // Offset based on direction - northbound slightly left, southbound slightly right
          'text-offset': ['case',
            ['==', ['get', 'direction'], 'N'], ['literal', [-0.8, 0]],
            ['==', ['get', 'direction'], 'S'], ['literal', [0.8, 0]],
            ['literal', [0, 0]]
          ],
          'text-anchor': 'center',
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-opacity': 0.9,
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
        filter: ['has', 'bearing']
      });
    });

    m.dragRotate.disable();
    m.touchZoomRotate.disableRotation();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      m.remove();
      map.current = null;
    };
  }, []);

  // Update line visibility
  useEffect(() => {
    if (!map.current?.isStyleLoaded() || !linesLoaded) return;

    const m = map.current;
    if (activeLines === null) {
      m.setFilter('subway-lines-glow', null);
      m.setFilter('subway-lines-main', null);
    } else {
      const routeFilter = ['in', ['get', 'route'], ['literal', Array.from(activeLines)]];
      m.setFilter('subway-lines-glow', routeFilter);
      m.setFilter('subway-lines-main', routeFilter);
    }
  }, [activeLines, linesLoaded]);

  // Update animation targets when train data changes
  useEffect(() => {
    const now = performance.now();

    filteredTrains.forEach(train => {
      const newPos: [number, number] = [train.longitude, train.latitude];
      const currentPos = currentPositions.current.get(train.id);
      const existingAnim = trainAnimations.current.get(train.id);

      // Check if position actually changed
      if (currentPos &&
          Math.abs(currentPos[0] - newPos[0]) < 0.000001 &&
          Math.abs(currentPos[1] - newPos[1]) < 0.000001) {
        return;
      }

      // Calculate starting position
      let startPos: [number, number];
      if (existingAnim && existingAnim.path) {
        // Get current interpolated position along path
        const elapsed = now - existingAnim.startTime;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutCubic(progress);
        startPos = pointAlongLine(
          existingAnim.path,
          existingAnim.startIndex!,
          existingAnim.startT!,
          existingAnim.endIndex!,
          existingAnim.endT!,
          easedProgress
        );
      } else if (existingAnim) {
        const elapsed = now - existingAnim.startTime;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutCubic(progress);
        startPos = [
          existingAnim.startPos[0] + (existingAnim.endPos[0] - existingAnim.startPos[0]) * easedProgress,
          existingAnim.startPos[1] + (existingAnim.endPos[1] - existingAnim.startPos[1]) * easedProgress
        ];
      } else if (currentPos) {
        startPos = currentPos;
      } else {
        startPos = newPos;
      }

      const dist = distance(startPos, newPos);

      if (dist > 0.02) {
        // Too far, snap
        currentPositions.current.set(train.id, newPos);
        trainAnimations.current.delete(train.id);
      } else if (dist > 0.00001) {
        // Try to find a path along the track
        const pathInfo = findPathBetweenPoints(train.routeId, startPos, newPos);

        if (pathInfo) {
          trainAnimations.current.set(train.id, {
            startPos,
            endPos: newPos,
            startTime: now,
            routeId: train.routeId,
            path: pathInfo.path,
            startIndex: pathInfo.startIndex,
            startT: pathInfo.startT,
            endIndex: pathInfo.endIndex,
            endT: pathInfo.endT
          });
        } else {
          // Fall back to straight line
          trainAnimations.current.set(train.id, {
            startPos,
            endPos: newPos,
            startTime: now,
            routeId: train.routeId
          });
        }
      }
    });

    // Clean up old train data
    const currentIds = new Set(filteredTrains.map(t => t.id));
    trainAnimations.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        trainAnimations.current.delete(id);
        currentPositions.current.delete(id);
      }
    });
  }, [filteredTrains, findPathBetweenPoints]);

  // Animation loop
  const animate = useCallback(() => {
    if (!map.current?.getSource('trains')) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const now = performance.now();
    const source = map.current.getSource('trains') as mapboxgl.GeoJSONSource;

    const features = filteredTrains.map(train => {
      const anim = trainAnimations.current.get(train.id);
      let coords: [number, number];

      if (anim) {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutCubic(progress);

        if (anim.path && anim.startIndex !== undefined) {
          // Animate along path
          coords = pointAlongLine(
            anim.path,
            anim.startIndex,
            anim.startT!,
            anim.endIndex!,
            anim.endT!,
            easedProgress
          );
        } else {
          // Straight line fallback
          coords = [
            anim.startPos[0] + (anim.endPos[0] - anim.startPos[0]) * easedProgress,
            anim.startPos[1] + (anim.endPos[1] - anim.startPos[1]) * easedProgress
          ];
        }

        if (progress >= 1) {
          currentPositions.current.set(train.id, anim.endPos);
          trainAnimations.current.delete(train.id);
        }
      } else {
        coords = currentPositions.current.get(train.id) || [train.longitude, train.latitude];
        currentPositions.current.set(train.id, coords);
      }

      // Calculate bearing from animation path or route
      let bearing: number | null = null;
      const trainAnim = trainAnimations.current.get(train.id);
      const direction = getDirectionFromStopId(train.currentStopId);

      if (trainAnim && trainAnim.path && trainAnim.path.length >= 2) {
        // Use the path to calculate actual bearing along the track
        const nearest = nearestPointOnLine(coords, trainAnim.path);
        const idx = nearest.index;

        // Get two points along the path to calculate direction
        let fromPt: [number, number], toPt: [number, number];

        if (idx < trainAnim.path.length - 1) {
          fromPt = trainAnim.path[idx];
          toPt = trainAnim.path[idx + 1];
        } else {
          fromPt = trainAnim.path[idx - 1];
          toPt = trainAnim.path[idx];
        }

        bearing = calculateBearing(fromPt, toPt);

        // Reverse if going southbound
        if (direction === 'S') {
          bearing = bearing + 180;
        }
      } else if (direction) {
        // Fallback: try to find bearing from route paths
        const paths = routePaths.current.get(train.routeId);
        if (paths && paths.length > 0) {
          for (const path of paths) {
            if (path.length < 2) continue;
            const nearest = nearestPointOnLine(coords, path);
            const dist = distance(coords, nearest.point);
            if (dist < 0.005) {
              const idx = nearest.index;
              let fromPt: [number, number], toPt: [number, number];

              if (idx < path.length - 1) {
                fromPt = path[idx];
                toPt = path[idx + 1];
              } else {
                fromPt = path[idx - 1];
                toPt = path[idx];
              }

              bearing = calculateBearing(fromPt, toPt);
              if (direction === 'S') {
                bearing = bearing + 180;
              }
              break;
            }
          }
        }
      }

      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: coords },
        properties: {
          id: train.id,
          routeId: train.routeId,
          status: train.status,
          color: LINE_COLORS[train.routeId]?.glow || '#808080',
          ...(bearing !== null && { bearing: bearing - 90 }), // Adjust for ▶ pointing right
          ...(direction && { direction }), // N or S for offset
        }
      };
    });

    source.setData({ type: 'FeatureCollection', features });
    animationRef.current = requestAnimationFrame(animate);
  }, [filteredTrains]);

  // Start animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animate]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const isLineActive = (lineGroup: string) => {
    if (activeLines === null) return true;
    const routes = LINE_GROUPS[lineGroup] || [lineGroup];
    return routes.some(r => activeLines.has(r));
  };

  return (
    <div className="map-container">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      <AlertPanel alerts={alerts} activeLines={activeLines} />

      <div className="status-badge">
        <div className="train-count">{filteredTrains.length}</div>
        <div>active trains</div>
        {lastUpdated && (
          <div className="last-updated">Updated {formatTime(lastUpdated)}</div>
        )}
      </div>

      <div className={`legend ${legendCollapsed ? 'collapsed' : ''}`}>
        <div className="legend-header">
          <button
            className="legend-toggle"
            onClick={() => setLegendCollapsed(!legendCollapsed)}
            aria-label={legendCollapsed ? 'Expand legend' : 'Collapse legend'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className={legendCollapsed ? 'rotated' : ''}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span>Lines</span>
          {activeLines !== null && !legendCollapsed && (
            <button className="show-all-btn" onClick={showAllLines}>
              Show All
            </button>
          )}
        </div>
        {!legendCollapsed && Object.entries(LINE_GROUPS).map(([label, routes]) => {
          const colors = LINE_COLORS[routes[0]];
          const isActive = isLineActive(label);
          const count = trains.filter(t => routes.includes(t.routeId)).length;

          return (
            <div
              key={label}
              className={`legend-item ${isActive ? 'active' : 'inactive'}`}
              onClick={() => toggleLine(label)}
            >
              <div
                className="legend-dot"
                style={{
                  background: colors?.glow || '#808080',
                  boxShadow: isActive ? `0 0 8px ${colors?.glow || '#808080'}` : 'none',
                  opacity: isActive ? 1 : 0.3,
                }}
              />
              <span className="legend-label">{label}</span>
              <span className="legend-count">{count}</span>
            </div>
          );
        })}
      </div>

      {error && <div className="error-message">{error}</div>}

      {isLoading && trains.length === 0 && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      )}
    </div>
  );
}
