module.exports = {
  apps: [
    {
      name: 'ponysays-dev',
      script: './server.js',
      env: {
        NODE_ENV: 'development',
        PORT: 8002,
        OSC_LOCAL_ADDRESS: '0.0.0.0',
        OSC_LOCAL_PORT: 57123,
        OSC_REMOTE_ADDRESS: '127.0.0.1',
        OSC_REMOTE_PORT: 57122,
        WS_HOST: 'localhost',
        WS_PORT: 8002,
      },
    },
  ],
};
