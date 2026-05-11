import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cue: {
          // Light theme — solid off-white (window no longer transparent).
          bg: '#f8f8fa',
          surface: '#ffffff',
          accent: '#7c5cff',
          accentMuted: '#a596ff',
          text: '#1c1c1e',
          muted: '#6e6e73',
          subtle: '#d1d1d6',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
