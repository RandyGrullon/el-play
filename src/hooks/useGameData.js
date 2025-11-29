import { useState, useEffect } from 'react';
import { fetchGameData, fetchSchedule } from '../services/api';

export const useGameData = (gamePk, pollingInterval = 2000) => {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!gamePk) return;

    const loadData = async () => {
      try {
        const data = await fetchGameData(gamePk); // Ensure api.js fetchGameData accepts arg
        setGameData(data);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        console.error("Fetch error:", err);
        setError('Error connecting to live feed.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, pollingInterval);
    return () => clearInterval(interval);
  }, [gamePk, pollingInterval]);

  return { gameData, loading, error, lastUpdated };
};

export const useSchedule = (pollingInterval = 2000) => {
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const data = await fetchSchedule();
        setSchedule(data);
      } catch (err) {
        console.error("Schedule error:", err);
      }
    };

    loadSchedule();
    const interval = setInterval(loadSchedule, pollingInterval);
    return () => clearInterval(interval);
  }, [pollingInterval]);

  return schedule;
};

