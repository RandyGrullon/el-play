import { useState, useEffect } from 'react';
import { fetchGameData, fetchSchedule } from '../services/api';

export const useGameData = (gamePk, pollingInterval = 2000) => {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!gamePk) return;

    let timeoutId;
    let isMounted = true;

    const loadData = async () => {
      try {
        const data = await fetchGameData(gamePk);
        if (isMounted) {
          setGameData(data);
          setLastUpdated(new Date());
          setError(null);
          setLoading(false);

          // Calculate next poll interval
          let nextPoll = pollingInterval; // Default 2s

          if (data.status === 'Final' || data.status === 'Game Over' || data.status === 'Completed') {
            nextPoll = 60000 * 5; // 5 minutes (effectively stop, but keep checking rarely)
          } else if (data.status === 'Live' || data.status === 'In Progress') {
            nextPoll = 2000; // 2 seconds
          } else {
            // Preview / Scheduled
            const gameTime = new Date(data.gameDate).getTime();
            const now = new Date().getTime();
            const diff = gameTime - now;

            if (diff > 60 * 60 * 1000) { // > 1 hour
              nextPoll = 60000 * 10; // 10 minutes
            } else if (diff > 5 * 60 * 1000) { // > 5 minutes
              nextPoll = 60000; // 1 minute
            } else {
              nextPoll = 10000; // 10 seconds (close to start)
            }
          }

          timeoutId = setTimeout(loadData, nextPoll);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        if (isMounted) {
          setError('Error connecting to live feed.');
          setLoading(false);
          // Retry after 10 seconds on error
          timeoutId = setTimeout(loadData, 10000);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [gamePk]);

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

