module.exports = {
  '/jira-api': {
    target: 'https://jira-neo.hooshmandsepehrco.com',
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      '^/jira-api': '',
    },
    logLevel: 'debug',
    onProxyReq: function (proxyReq, req, res) {
      proxyReq.removeHeader('Origin');
      proxyReq.removeHeader('Referer');
    },
  },
};
