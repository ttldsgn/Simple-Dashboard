module.exports = {
  apps: [
    {
      name: 'nodejs-dashboard.totaldsgn.com',
      cwd: '/var/www/dashboard.totaldsgn.com/client-dashboard',
      script: 'node_modules/.bin/next',
      args: 'start -p 3003',
      env: {
        NODE_ENV: 'production',
        PORT: '3003',
      },
    },
  ],
};