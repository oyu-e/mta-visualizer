import { useEffect, useCallback, useRef } from 'react';
import { useTrainStore, type Train, type Alert } from '../store/trainStore';

const API_ENDPOINT = '/api/trains';
const POLL_INTERVAL = 5000; // 5 seconds

interface ApiResponse {
  trains: Train[];
  alerts: Alert[];
}

export function useTrainPositions() {
  const { trains, alerts, lastUpdated, isLoading, error, setTrains, setAlerts, setLoading, setError } = useTrainStore();
  const intervalRef = useRef<number | null>(null);

  const fetchTrains = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      setTrains(data.trains);
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch train data');
    }
  }, [setTrains, setAlerts, setLoading, setError]);

  useEffect(() => {
    // Initial fetch
    fetchTrains();

    // Set up polling
    intervalRef.current = window.setInterval(fetchTrains, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTrains]);

  return {
    trains,
    alerts,
    lastUpdated,
    isLoading,
    error,
    refetch: fetchTrains,
  };
}
