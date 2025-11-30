# Vercel Analytics Integration

## 📊 Overview

This application integrates **Vercel Analytics** and **Vercel Speed Insights** to track user interactions, page views, and performance metrics.

## 🚀 Features

### 1. **Automatic Page View Tracking**
- Every page visit is automatically tracked
- No additional configuration needed

### 2. **Custom Event Tracking**
We track the following custom events:

#### Game Interactions
- **`game_view`**: When a user views a game detail page
  - Tracks: `gamePk`, `homeTeam`, `awayTeam`, `timestamp`

- **`tab_change`**: When a user switches between tabs (Live/Stats)
  - Tracks: `gamePk`, `tabName`, `timestamp`

#### Notifications
- **`notification_subscribe`**: When a user subscribes to game notifications
  - Tracks: `gamePk`, `teamName`, `timestamp`

- **`notification_unsubscribe`**: When a user unsubscribes from notifications
  - Tracks: `gamePk`, `timestamp`

#### Team Preferences
- **`favorite_team_set`**: When a user sets their favorite team
  - Tracks: `teamId`, `teamName`, `timestamp`

#### Navigation
- **`schedule_date_change`**: When a user changes the date in the schedule bar
  - Tracks: `date`, `timestamp`

- **`standings_team_click`**: When a user clicks on a team in standings
  - Tracks: `teamId`, `teamName`, `timestamp`

- **`leaders_view`**: When a user views the leaders section
  - Tracks: `category`, `timestamp`

#### Advertising
- **`ad_interaction`**: When a user interacts with ads
  - Tracks: `adType`, `action`, `timestamp`

### 3. **Performance Monitoring**
- **Speed Insights** tracks Core Web Vitals:
  - First Contentful Paint (FCP)
  - Largest Contentful Paint (LCP)
  - Cumulative Layout Shift (CLS)
  - First Input Delay (FID)
  - Time to First Byte (TTFB)

## 📦 Installation

Already installed via:
```bash
npm install @vercel/analytics @vercel/speed-insights
```

## 🔧 Usage

### Using the Analytics Hook

```javascript
import { useAnalytics } from '../hooks/useAnalytics';

function MyComponent() {
    const { trackGameView, trackTabChange } = useAnalytics();

    // Track game view
    useEffect(() => {
        trackGameView('12345', 'Tigres del Licey', 'Leones del Escogido');
    }, []);

    // Track tab change
    const handleTabClick = (tab) => {
        trackTabChange('12345', tab);
    };

    return (
        <button onClick={() => handleTabClick('stats')}>
            Ver Estadísticas
        </button>
    );
}
```

## 📈 Viewing Analytics

1. **Deploy to Vercel**
   ```bash
   git push origin main
   ```

2. **Access Analytics Dashboard**
   - Go to your Vercel project dashboard
   - Click on the "Analytics" tab
   - View real-time and historical data

3. **Custom Events**
   - Navigate to "Events" section in Analytics
   - Filter by event name to see specific interactions
   - Export data for further analysis

## 🎯 What You Can Track

### User Engagement
- Which games are most viewed
- Which tabs users prefer (Live vs Stats)
- How often users switch between dates
- Which teams are most popular

### Conversion Metrics
- Notification subscription rate
- Ad interaction rate
- User retention patterns

### Performance
- Page load times
- Core Web Vitals scores
- Performance by device/browser
- Geographic performance data

## 🔒 Privacy

- All tracking is anonymous
- No personally identifiable information (PII) is collected
- Complies with GDPR and privacy regulations
- Users can opt-out via browser settings

## 🛠️ Development

To test analytics locally:

```bash
# Run dev server
npm run dev

# Analytics will work in production mode
npm run build
npm run preview
```

**Note**: Analytics only sends data in production builds deployed to Vercel.

## 📝 Best Practices

1. **Track Meaningful Events**: Only track events that provide actionable insights
2. **Use Descriptive Names**: Event names should be clear and consistent
3. **Include Context**: Always include relevant metadata (gamePk, teamName, etc.)
4. **Respect Privacy**: Never track sensitive user information
5. **Monitor Performance**: Regularly check Speed Insights for optimization opportunities

## 🚨 Troubleshooting

### Analytics not showing data?
- Ensure you're in production mode (deployed to Vercel)
- Check that events are being called correctly
- Verify Vercel Analytics is enabled in project settings

### Events not appearing?
- Wait 5-10 minutes for data to appear
- Check browser console for errors
- Verify event names match exactly

## 📚 Resources

- [Vercel Analytics Documentation](https://vercel.com/docs/analytics)
- [Speed Insights Documentation](https://vercel.com/docs/speed-insights)
- [Custom Events Guide](https://vercel.com/docs/analytics/custom-events)
