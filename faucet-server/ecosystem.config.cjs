module.exports = {
  apps: [{
    name: 'clawevo-faucet',
    script: 'dist/index.js',
    cwd: '/root/clawevo-faucet',
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://faucet:faucet-pass@localhost:5433/clawevo_faucet',
      PORT: process.env.PORT || 4001,
      OPERATOR_PK: process.env.OPERATOR_PK || '0x<your_operator_private_key>',
      BSC_TESTNET_RPC_URL: process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-dataseed.bnbchain.org',
    },
  }],
};
