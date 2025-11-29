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
        if (notificationsEnabled) {
            requestNotificationPermission();
        }
    }, [notificationsEnabled]);

    useEffect(() => {
        localStorage.setItem(SUBSCRIBED_GAMES_KEY, JSON.stringify(subscribedGames));
    }, [subscribedGames]);

    const toggleFavoriteTeam = useCallback((teamId: number) => {
        setFavoriteTeamId(prev => prev === teamId ? null : teamId);
    }, []);

    const toggleGameSubscription = useCallback((gameId: number) => {
        setSubscribedGames(prev => {
            const isSubscribed = prev.includes(gameId);
            if (!isSubscribed) {
                requestNotificationPermission();
            }
            return isSubscribed ? prev.filter(id => id !== gameId) : [...prev, gameId];
        });
    }, []);

    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) {
            console.log('This browser does not support desktop notification');
            return;
        }
        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setNotificationsEnabled(false);
            }
        }
    };

    const toggleNotifications = useCallback(() => {
        setNotificationsEnabled(prev => !prev);
    }, []);

    return {
        favoriteTeamId,
        toggleFavoriteTeam,
        notificationsEnabled,
        toggleNotifications,
        subscribedGames,
        toggleGameSubscription
    };
};
