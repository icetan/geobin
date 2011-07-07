var http = require('http')
,parseUrl = require('url').parse
,util = require('./lib/util')
,controller = require('./lib/controller')
,dispatch = require('./lib/dispatch')
,conf = require('./lib/config');

// If an argument is given in the command line, override server port.
if (process.argv[2])
  conf.serverPort = parseInt(process.argv[2]);

var server = http.createServer()
,rootPath = conf.serverRootPath || ''; // Just easier to use.

server.on('request', function (req, res) {
  var url = parseUrl(req.url)
  ,handlePath = (url.pathname.substr(0, rootPath.length) === rootPath)
  ,handled = 0;
  console.log(req.method+' '+req.url);
  console.dir(req.headers);
  if (handlePath) {
    var path = url.pathname.substr(rootPath.length);
    dispatch.match(path, {
      '^/geo/([^/]+)$': {
        GET: function (id) {
            controller.getAnonymousGeo(req, res, id);
        }
      }
      ,'^/geo$': {
        GET: function () {
          controller.listAnonymousGeo(req, res);
        }
        ,POST: function () {
          controller.saveAnonymousGeo(req, res);
        }
      }

      ,'^/user/([^/]+)$': {
        GET: function (username) {
          controller.getUser(req, res, username);
        }
      }
      ,'^/user/([^/]+)/geo$': {
        GET: function (username) {
          controller.listGeo(req, res, username);
        }
        ,POST: function (username) {
          controller.saveGeo(req, res, username);
        }
      }
      
      ,'^/token$': {
        GET: function () {
          controller.getToken(req, res);
        }
        ,POST: function () {
          controller.getToken(req, res);
        }
      }
    }
    ,function (handler, args) {
      if (handled++ === 0) {
        console.dir(arguments);
        dispatch.route(req.method, handler, function (method) {
          method.apply(this, args);
        }
        ,function () {
          controller.methodNotAllowed(req, res);
        });
      } else {
        console.log('WARNING: "'+url.pathname+'" matched more than one handler.');
      }
    });
  }
  if (handled === 0) controller.notFound(req, res);
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');
