import { useQuery } from '@tanstack/react-query';
import { fetchGameData, fetchSchedule } from '../services/api';

// Función para generar intervalos aleatorios con jitter
const getRandomInterval = (min, max, jitterFactor = 0.3) => {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = base * jitterFactor * (Math.random() * 2 - 1);
  return Math.max(1000, Math.floor(base + jitter));
};

export const useGameData = (gamePk) => {
  const { data: gameData, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['game', gamePk],
    queryFn: () => fetchGameData(gamePk),
    enabled: !!gamePk,
    retry: 2, // Solo 2 reintentos
    retryDelay: 1000, // 1 segundo entre reintentos
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return getRandomInterval(5000, 8000);

      if (data.status === 'Final' || data.status === 'Game Over' || data.status === 'Completed') {
        return false; // ❌ NO actualizar juegos finalizados
      } else if (data.status === 'Live' || data.status === 'In Progress') {
        return getRandomInterval(3000, 7000); // 3-7 segundos aleatorios para juegos en vivo
      } else {
        // Preview / Scheduled logic
        const gameTime = new Date(data.gameDate).getTime();
        const now = new Date().getTime();
        const diff = gameTime - now;

        if (diff > 60 * 60 * 1000) return false; // ❌ > 1 hora -> NO actualizar
        if (diff > 30 * 60 * 1000) return false; // ❌ > 30 mins -> NO actualizar
        if (diff > 5 * 60 * 1000) return getRandomInterval(45000, 75000); // 5-30 mins -> 45-75s aleatorios
        return getRandomInterval(8000, 15000); // < 5 mins del inicio -> 8-15s aleatorios
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
    retry: 2, // Solo 2 reintentos
    retryDelay: 1000, // 1 segundo entre reintentos
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return getRandomInterval(50000, 90000); // Si no hay data, check cada 50-90s

      const now = new Date().getTime();

      // Check for live games
      const hasLiveGames = data.some(game =>
        game.status === 'Live' || game.status === 'In Progress'
      );

      if (hasLiveGames) {
        return getRandomInterval(10000, 20000); // 10-20 segundos aleatorios con juegos en vivo
      }

      // Check for games starting within 30 mins
      const upcomingGames = data.filter(game => {
        const gameTime = new Date(game.date).getTime();
        const diff = gameTime - now;
        return diff > 0 && diff <= 30 * 60 * 1000; // 0-30 mins
      });

      if (upcomingGames.length > 0) {
        // Si hay juegos empezando en < 5 mins, update más frecuente
        const veryCloseSoon = upcomingGames.some(game => {
          const gameTime = new Date(game.date).getTime();
          const diff = gameTime - now;
          return diff <= 5 * 60 * 1000;
        });

        if (veryCloseSoon) {
          return getRandomInterval(15000, 25000); // 15-25s aleatorios cuando está muy cerca
        }

        return getRandomInterval(30000, 50000); // 30-50s aleatorios para juegos próximos (5-30 mins)
      }

      // Check if all games are finished
      const allGamesFinished = data.every(game => 
        game.status === 'Final' || 
        game.status === 'Game Over' || 
        game.status === 'Completed'
      );

      if (allGamesFinished) {
        return false; // ❌ NO actualizar si todos los juegos terminaron
      }

      // Check if there are any scheduled games today
      const hasScheduledGames = data.some(game => {
        const gameTime = new Date(game.date).getTime();
        return gameTime > now;
      });

      if (!hasScheduledGames) {
        return false; // ❌ NO actualizar si no hay juegos programados
      }

      // Si hay juegos programados pero faltan > 30 mins
      const nextGameTime = Math.min(
        ...data
          .filter(game => new Date(game.date).getTime() > now)
          .map(game => new Date(game.date).getTime())
      );

      const timeToNextGame = nextGameTime - now;

      if (timeToNextGame > 30 * 60 * 1000) {
        return false; // ❌ NO actualizar si el próximo juego es en más de 30 mins
      }

      // Fallback: si algo salió mal, check cada 60-90s
      return getRandomInterval(60000, 90000);
    }
  });

  return { schedule, loading: isLoading, refetch };
};
