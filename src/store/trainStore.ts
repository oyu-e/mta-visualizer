import { create } from 'zustand';
import type { LineId } from '../data/lines';

export interface Train {
  id: string;
  routeId: LineId;
  latitude: number;
  longitude: number;
  bearing?: number;
  tripId: string;
  status: 'IN_TRANSIT' | 'STOPPED' | 'INCOMING';
  currentStopId?: string;
  timestamp: number;
}

export interface Alert {
  id: string;
  routeIds: string[];
  headerText: string;
  descriptionText: string;
  activePeriodStart?: number;
  activePeriodEnd?: number;
}

interface TrainStore {
  trains: Train[];
  alerts: Alert[];
  lastUpdated: number | null;
  isLoading: boolean;
  error: string | null;

  // Line filtering
  activeLines: Set<string> | null; // null = show all, Set = show only these

  setTrains: (trains: Train[]) => void;
  setAlerts: (alerts: Alert[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleLine: (line: string) => void;
  showAllLines: () => void;
  showOnlyLine: (line: string) => void;
}

// Group routes by color family
export const LINE_GROUPS: Record<string, string[]> = {
  '1/2/3': ['1', '2', '3'],
  '4/5/6': ['4', '5', '6'],
  '7': ['7'],
  'A/C/E': ['A', 'C', 'E'],
  'B/D/F/M': ['B', 'D', 'F', 'M'],
  'G': ['G'],
  'J/Z': ['J', 'Z'],
  'L': ['L'],
  'N/Q/R/W': ['N', 'Q', 'R', 'W'],
  'S': ['S', 'GS', 'FS', 'H', 'SI'],
};

export const useTrainStore = create<TrainStore>((set, get) => ({
  trains: [],
  alerts: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
  activeLines: null,

  setTrains: (trains) => set({
    trains,
    lastUpdated: Date.now(),
    error: null
  }),

  setAlerts: (alerts) => set({ alerts }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  toggleLine: (lineGroup: string) => {
    const { activeLines } = get();
    const routes = LINE_GROUPS[lineGroup] || [lineGroup];

    if (activeLines === null) {
      // Currently showing all - show only this line group
      set({ activeLines: new Set(routes) });
    } else {
      const newActive = new Set(activeLines);
      const allPresent = routes.every(r => newActive.has(r));

      if (allPresent) {
        // Remove all routes in this group
        routes.forEach(r => newActive.delete(r));
        // If empty, show all
        set({ activeLines: newActive.size === 0 ? null : newActive });
      } else {
        // Add all routes in this group
        routes.forEach(r => newActive.add(r));
        set({ activeLines: newActive });
      }
    }
  },

  showAllLines: () => set({ activeLines: null }),

  showOnlyLine: (lineGroup: string) => {
    const routes = LINE_GROUPS[lineGroup] || [lineGroup];
    set({ activeLines: new Set(routes) });
  },
}));
