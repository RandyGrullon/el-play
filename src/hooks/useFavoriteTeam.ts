import { useState, useEffect, useCallback } from 'react';

const FAVORITE_TEAM_KEY = 'el-play-favorite-team';
const NOTIFICATIONS_KEY = 'el-play-notifications-enabled';
const SUBSCRIBED_GAMES_KEY = 'el-play-subscribed-games';

export const useFavoriteTeam = () => {
    const [favoriteTeamId, setFavoriteTeamId] = useState<number | null>(() => {
        const stored = localStorage.getItem(FAVORITE_TEAM_KEY);
        return stored ? parseInt(stored) : null;
    });

    const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
        return localStorage.getItem(NOTIFICATIONS_KEY) === 'true';
    });

    const [subscribedGames, setSubscribedGames] = useState<number[]>(() => {
        const stored = localStorage.getItem(SUBSCRIBED_GAMES_KEY);
        return stored ? JSON.parse(stored) : [];
    });

    useEffect(() => {
        if (favoriteTeamId) {
            localStorage.setItem(FAVORITE_TEAM_KEY, favoriteTeamId.toString());
        } else {
            localStorage.removeItem(FAVORITE_TEAM_KEY);
        }
    }, [favoriteTeamId]);

    useEffect(() => {
        localStorage.setItem(NOTIFICATIONS_KEY, notificationsEnabled.toString());
    }, [notificationsEnabled]);

    useEffect(() => {
        localStorage.setItem(SUBSCRIBED_GAMES_KEY, JSON.stringify(subscribedGames));
    }, [subscribedGames]);

    const toggleFavoriteTeam = useCallback((teamId: number) => {
        setFavoriteTeamId(prev => prev === teamId ? null : teamId);
    }, []);

    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) {
            console.log('This browser does not support desktop notification');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        const permission = await Notification.requestPermission();
        return permission === 'granted';
    };

    const toggleGameSubscription = useCallback(async (gameId: number) => {
        const isSubscribed = subscribedGames.includes(gameId);

        if (!isSubscribed) {
            const granted = await requestNotificationPermission();
            if (granted) {
                setSubscribedGames(prev => [...prev, gameId]);
            }
        } else {
            setSubscribedGames(prev => prev.filter(id => id !== gameId));
        }
    }, [subscribedGames]);

    const toggleNotifications = useCallback(async () => {
        if (!notificationsEnabled) {
            const granted = await requestNotificationPermission();
            if (granted) {
                setNotificationsEnabled(true);
            }
        } else {
            setNotificationsEnabled(false);
        }
    }, [notificationsEnabled]);

    return {
        favoriteTeamId,
        toggleFavoriteTeam,
        notificationsEnabled,
        toggleNotifications,
        subscribedGames,
        toggleGameSubscription
    };
};
