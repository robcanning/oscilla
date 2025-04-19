module.exports = {
  apps: [
    {
      name: 'ponysays-live',
      script: './server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 8001,
        OSC_LOCAL_ADDRESS: '0.0.0.0',
        OSC_LOCAL_PORT: 57221,
        OSC_REMOTE_ADDRESS: '127.0.0.1', // Example production address
        OSC_REMOTE_PORT: 57220,
        WS_HOST: 'localhost',
        WS_PORT: 8001,
      },
    },
  ],
};
