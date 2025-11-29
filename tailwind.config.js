/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'bounce-slow': 'bounce 3s infinite',
                'ping-slow': 'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
                'ping-slower': 'ping 4s cubic-bezier(0, 0, 0.2, 1) infinite',
            },
        },
    },
    plugins: [],
}
