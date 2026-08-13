const config = {
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
};

export default config;
