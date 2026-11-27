import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(api|bot|config|constants|parser|services|sources)(.*)$/,
        replacement: path.resolve(__dirname, 'src/$1$2'),
      },
    ],
  },
  test: {
    globals: true,
  },
});
