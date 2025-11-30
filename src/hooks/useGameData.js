import { useQuery } from '@tanstack/react-query';
import { fetchGameData, fetchSchedule } from '../services/api';

export const useGameData = (gamePk) => {
  const { data: gameData, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['game', gamePk],
    queryFn: () => fetchGameData(gamePk),
    enabled: !!gamePk,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;

      if (data.status === 'Final' || data.status === 'Game Over' || data.status === 'Completed') {
        return 60000 * 5; // 5 minutes
      } else if (data.status === 'Live' || data.status === 'In Progress') {
        return 2000; // 2 seconds
      } else {
        // Preview / Scheduled logic
        const gameTime = new Date(data.gameDate).getTime();
        const now = new Date().getTime();
        const diff = gameTime - now;

        if (diff > 60 * 60 * 1000) return 60000 * 10; // > 1 hour -> 10 mins
        if (diff > 5 * 60 * 1000) return 60000; // > 5 mins -> 1 min
        return 10000; // Close to start -> 10s
      }
    }
  });

  return {
    gameData,
    loading: isLoading,
    error: error ? error.message : null,
    lastUpdated: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
    refetch
  };
};

export const useSchedule = () => {
  const { data: schedule = [], isLoading, refetch } = useQuery({
    queryKey: ['schedule'],
    queryFn: fetchSchedule,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;

      // Check for live games
      const hasLiveGames = data.some(game =>
        game.status === 'Live' || game.status === 'In Progress'
      );

      if (hasLiveGames) {
        return 2000; // 2 seconds (Same as Game Detail)
      }

      // Check for games starting soon (within 30 mins)
      const now = new Date().getTime();
      const hasUpcomingGames = data.some(game => {
        const gameTime = new Date(game.date).getTime();
        const diff = gameTime - now;
        return diff > 0 && diff <= 30 * 60 * 1000;
      });

      if (hasUpcomingGames) {
        return 10000; // 10 seconds
      }

      return 60000; // 1 minute
    }
  });

  return { schedule, loading: isLoading, refetch };
};
