module.exports = {
  apps: [
    {
      name: 'dcarnes-bot',
      script: 'dist/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 50,
      min_uptime: '15s',
      restart_delay: 3000,
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
