// PM2 ecosystem manifest for 4-Cell Rules Matrix (ADR-0007)
// LLM cells retired after 34-day empirical benchmark proved Rules superiority (ADR-0004 / ADR-0007).

module.exports = {
  apps: [
    // 1. Sniper (Rules) — Designated forward telemetry resolver worker
    {
      name: 'charon-sniper-rules',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/sniper-rules.out.log',
      error_file: './logs/sniper-rules.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/sniper_rules.sqlite',
        ACTIVE_STRATEGY_ID: 'sniper',
        FORCE_USE_LLM: 'false',
        DISABLE_TELEGRAM_POLLING: 'true',
        ENABLE_FORWARD_RESOLVER: 'true',
      },
    },

    // 2. Degen (Rules) — Primary Stage 2 candidate ($25k-$80k mcap, 4h timeout)
    {
      name: 'charon-degen-rules',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/degen-rules.out.log',
      error_file: './logs/degen-rules.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/degen_rules.sqlite',
        ACTIVE_STRATEGY_ID: 'degen',
        FORCE_USE_LLM: 'false',
        DISABLE_TELEGRAM_POLLING: 'true',
      },
    },

    // 3. Smart Money (Rules) — Tuned: TP 35%, SL -15%, Trailing 10%, Size 0.05 SOL, 4h timeout
    {
      name: 'charon-smart_money-rules',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/smart_money-rules.out.log',
      error_file: './logs/smart_money-rules.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/smart_money_rules.sqlite',
        ACTIVE_STRATEGY_ID: 'smart_money',
        FORCE_USE_LLM: 'false',
        DISABLE_TELEGRAM_POLLING: 'true',
      },
    },

    // 4. Dip Buy (Rules) — Tuned: 4h timeout
    {
      name: 'charon-dip_buy-rules',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      watch: false,
      out_file: './logs/dip_buy-rules.out.log',
      error_file: './logs/dip_buy-rules.err.log',
      merge_logs: true,
      time: true,
      env: {
        DB_PATH: './data/dip_buy_rules.sqlite',
        ACTIVE_STRATEGY_ID: 'dip_buy',
        FORCE_USE_LLM: 'false',
        DISABLE_TELEGRAM_POLLING: 'true',
      },
    },
  ],
};
