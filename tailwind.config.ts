import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/lib/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#0B0B0F',
          graphite: '#15151B',
          red: '#D71920',
          silver: '#D6D6D6'
        }
      }
    }
  },
  plugins: []
};

export default config;
