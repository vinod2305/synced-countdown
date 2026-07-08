import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedupe React so the file:-linked local package shares the demo's single
// React instance (the library declares React as a peer dependency).
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
