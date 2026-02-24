// MTA Subway Line Colors - Official colors with neon glow variants
export const LINE_COLORS: Record<string, { main: string; glow: string }> = {
  // IND Eighth Avenue Line (Blue)
  A: { main: '#0039A6', glow: '#00A0FF' },
  C: { main: '#0039A6', glow: '#00A0FF' },
  E: { main: '#0039A6', glow: '#00A0FF' },

  // IND Sixth Avenue Line (Orange)
  B: { main: '#FF6319', glow: '#FF8C00' },
  D: { main: '#FF6319', glow: '#FF8C00' },
  F: { main: '#FF6319', glow: '#FF8C00' },
  M: { main: '#FF6319', glow: '#FF8C00' },

  // IND Crosstown Line (Light Green)
  G: { main: '#6CBE45', glow: '#7FFF00' },

  // BMT Canarsie Line (Light Gray)
  L: { main: '#A7A9AC', glow: '#E0E0E0' },

  // BMT Nassau Street Line (Brown)
  J: { main: '#996633', glow: '#CD853F' },
  Z: { main: '#996633', glow: '#CD853F' },

  // BMT Broadway Line (Yellow)
  N: { main: '#FCCC0A', glow: '#FFD700' },
  Q: { main: '#FCCC0A', glow: '#FFD700' },
  R: { main: '#FCCC0A', glow: '#FFD700' },
  W: { main: '#FCCC0A', glow: '#FFD700' },

  // IRT Broadway-Seventh Avenue Line (Red)
  1: { main: '#EE352E', glow: '#FF4444' },
  2: { main: '#EE352E', glow: '#FF4444' },
  3: { main: '#EE352E', glow: '#FF4444' },

  // IRT Lexington Avenue Line (Green)
  4: { main: '#00933C', glow: '#00FF7F' },
  5: { main: '#00933C', glow: '#00FF7F' },
  6: { main: '#00933C', glow: '#00FF7F' },

  // IRT Flushing Line (Purple)
  7: { main: '#B933AD', glow: '#DA70D6' },

  // Shuttle (Dark Gray)
  S: { main: '#808183', glow: '#C0C0C0' },
  GS: { main: '#808183', glow: '#C0C0C0' }, // Grand Central Shuttle
  FS: { main: '#808183', glow: '#C0C0C0' }, // Franklin Avenue Shuttle
  H: { main: '#808183', glow: '#C0C0C0' },  // Rockaway Park Shuttle

  // Staten Island Railway (Blue)
  SI: { main: '#0039A6', glow: '#00A0FF' },
  SIR: { main: '#0039A6', glow: '#00A0FF' },
};

// MTA GTFS Feed endpoints
export const FEED_ENDPOINTS = {
  'ACE': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  'BDFM': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
  'G': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
  'JZ': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
  'NQRW': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
  'L': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
  '1234567': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'SIR': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si',
};

// Map route IDs to feed groups
export const ROUTE_TO_FEED: Record<string, keyof typeof FEED_ENDPOINTS> = {
  A: 'ACE', C: 'ACE', E: 'ACE',
  B: 'BDFM', D: 'BDFM', F: 'BDFM', M: 'BDFM',
  G: 'G',
  J: 'JZ', Z: 'JZ',
  N: 'NQRW', Q: 'NQRW', R: 'NQRW', W: 'NQRW',
  L: 'L',
  1: '1234567', 2: '1234567', 3: '1234567',
  4: '1234567', 5: '1234567', 6: '1234567', 7: '1234567',
  S: '1234567', GS: '1234567', FS: '1234567', H: '1234567',
  SIR: 'SIR',
};

export type LineId = keyof typeof LINE_COLORS;
