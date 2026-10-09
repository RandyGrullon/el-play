/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                bg: token('bg'),
                surface: token('surface'),
                raised: token('raised'),
                ink: token('ink'),
                muted: token('muted'),
                faint: token('faint'),
                line: token('line'),
                accent: token('accent'),
                'accent-ink': token('accent-ink'),
                live: token('live'),
                ball: token('ball'),
                strike: token('strike'),
                inplay: token('inplay'),
                hbp: token('hbp'),
                gold: token('gold')
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
                display: ['"Barlow Condensed"', 'Inter', 'system-ui', 'sans-serif']
            },
            borderRadius: {
                card: '14px'
            },
            boxShadow: {
                card: '0 1px 0 rgb(var(--line) / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)'
            },
            keyframes: {
                'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
                'pitch-in': { from: { opacity: '0', transform: 'scale(1.8)' }, to: { opacity: '1', transform: 'scale(1)' } },
                shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } }
            },
            animation: {
                'fade-up': 'fade-up .25s ease-out both',
                'pitch-in': 'pitch-in .35s cubic-bezier(.2,.8,.2,1) both',
                shimmer: 'shimmer 1.6s linear infinite'
            }
        }
    },
    plugins: []
};
