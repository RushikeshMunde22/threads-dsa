import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        threads: {
          bg: 'var(--threads-bg)',
          surface: 'var(--threads-surface)',
          elevated: 'var(--threads-elevated)',
          border: 'var(--threads-border)',
          text: 'var(--threads-text)',
          muted: 'var(--threads-muted)',
          hover: 'var(--threads-hover)',
        },
      },
      maxWidth: {
        feed: '620px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
