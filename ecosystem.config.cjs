// PM2 ecosystem for Kaiser.charon
// Secrets are injected by Doppler at boot — never store them here.
// Start:   doppler run --project charon --config dev -- pm2 start ecosystem.config.cjs
// Logs:    pm2 logs charon --lines 100
// Restart: doppler run --project charon --config dev -- pm2 restart charon
module.exports = {
  apps: [{
    name: 'charon',
    script: 'index.js',
    cwd: __dirname,
    // Doppler resolves secrets into env before node boots; PM2 inherits them.
    // On the VPS run via: doppler run --project charon --config dev -- pm2 start ecosystem.config.cjs
    autorestart: true,
    max_restarts: 20,
    min_uptime: '30s',
    restart_delay: 5000,
    watch: false,
    out_file: './logs/charon.out.log',
    error_file: './logs/charon.err.log',
    merge_logs: true,
    time: true,
    kill_timeout: 10000,
  }],
};
