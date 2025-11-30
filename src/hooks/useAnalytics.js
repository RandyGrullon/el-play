import { track } from '@vercel/analytics';

/**
 * Custom hook for tracking user interactions with Vercel Analytics
 */
export const useAnalytics = () => {
    /**
     * Track when a user views a game
     * @param {string} gamePk - Game ID
     * @param {string} homeTeam - Home team name
     * @param {string} awayTeam - Away team name
     */
    const trackGameView = (gamePk, homeTeam, awayTeam) => {
        track('game_view', {
            gamePk,
            homeTeam,
            awayTeam,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track when a user subscribes to game notifications
     * @param {string} gamePk - Game ID
     * @param {string} teamName - Team name
     */
    const trackNotificationSubscribe = (gamePk, teamName) => {
        track('notification_subscribe', {
            gamePk,
            teamName,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track when a user unsubscribes from game notifications
     * @param {string} gamePk - Game ID
     */
    const trackNotificationUnsubscribe = (gamePk) => {
        track('notification_unsubscribe', {
            gamePk,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track when a user sets a favorite team
     * @param {string} teamId - Team ID
     * @param {string} teamName - Team name
     */
    const trackFavoriteTeam = (teamId, teamName) => {
        track('favorite_team_set', {
            teamId,
            teamName,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track tab changes in game detail view
     * @param {string} gamePk - Game ID
     * @param {string} tabName - Tab name (e.g., 'live', 'stats', 'lineup')
     */
    const trackTabChange = (gamePk, tabName) => {
        track('tab_change', {
            gamePk,
            tabName,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track when a user clicks on a team in standings
     * @param {string} teamId - Team ID
     * @param {string} teamName - Team name
     */
    const trackStandingsTeamClick = (teamId, teamName) => {
        track('standings_team_click', {
            teamId,
            teamName,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track when a user views leaders
     * @param {string} category - Category (e.g., 'batting', 'pitching')
     */
    const trackLeadersView = (category) => {
        track('leaders_view', {
            category,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track ad banner interactions
     * @param {string} adType - Type of ad (e.g., 'banner', 'native')
     * @param {string} action - Action (e.g., 'view', 'click')
     */
    const trackAdInteraction = (adType, action) => {
        track('ad_interaction', {
            adType,
            action,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * Track schedule bar date changes
     * @param {string} date - Selected date
     */
    const trackScheduleDateChange = (date) => {
        track('schedule_date_change', {
            date,
            timestamp: new Date().toISOString()
        });
    };

    return {
        trackGameView,
        trackNotificationSubscribe,
        trackNotificationUnsubscribe,
        trackFavoriteTeam,
        trackTabChange,
        trackStandingsTeamClick,
        trackLeadersView,
        trackAdInteraction,
        trackScheduleDateChange
    };
};
