// PM2 ecosystem manifest for 2-Cell Canary Benchmark (Sniper LLM vs Sniper Rules)
// Injects distinct DB_PATH, ACTIVE_STRATEGY_ID, FORCE_USE_LLM, and DISABLE_TELEGRAM_POLLING per worker.

module.exports = {
  apps: [
    {
      name: 'charon-canary-sniper-llm',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/canary-sniper-llm.out.log',
      error_file: './logs/canary-sniper-llm.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/canary_sniper_llm.sqlite',
        ACTIVE_STRATEGY_ID: 'sniper',
        FORCE_USE_LLM: 'true',
        DISABLE_TELEGRAM_POLLING: 'true',
      },
    },
    {
      name: 'charon-canary-sniper-rules',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/canary-sniper-rules.out.log',
      error_file: './logs/canary-sniper-rules.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/canary_sniper_rules.sqlite',
        ACTIVE_STRATEGY_ID: 'sniper',
        FORCE_USE_LLM: 'false',
        DISABLE_TELEGRAM_POLLING: 'true',
        ENABLE_FORWARD_RESOLVER: 'true',
      },
    },
  ],
};
