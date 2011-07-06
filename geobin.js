var http = require('http')
,parseUrl = require('url').parse
,util = require('./util')
,controller = require('./controller')
,dispatch = require('./dispatch')
,conf = require('./config');

// If an argument is given in the command line, override server port.
if (process.argv[2])
  conf.serverPort = parseInt(process.argv[2]);

var server = http.createServer()
,method = function (req, res, handlers) {
//  if (!handlers['OPTIONS']) {
//    handlers['OPTIONS'] = function () {
//      res.writeHead(200, {
//        'Access-Control-Allow-Origin': '*'
//        ,'Access-Control-Allow-Headers': 'X-Requested-With'
//      });
//      res.end();
//    };
//  }
  dispatch.route(req.method, handlers, function () {
    controller.methodNotAllowed(req, res);
  });
}


,handlers = {
  '^/geo/([^/]+)$': function (id, req, res) {
    method(req, res, {
      GET: function () {
        controller.getAnonymousGeo(req, res, id);
      }
    });
  }
  ,'^/geo$': function (req, res) {
    method(req, res, {
      GET: function () {
        controller.listAnonymousGeo(req, res);
      }
      ,POST: function () {
        controller.saveAnonymousGeo(req, res);
      }
    });
  }

  ,'^/user/([^/]+)$': function (username, req, res) {
    method(req, res, {
      GET: function () {
        controller.getUser(req, res, username);
      }
    });
  }
  ,'^/user/([^/]+)/geo$': function (username, req, res) {
    method(req, res, {
      GET: function () {
        controller.listGeo(req, res, username);
      }
      ,POST: function () {
        controller.saveGeo(req, res, username);
      }
    });
  }
  
  ,'^/token$': function (req, res) {
    var oauth = function () {
      controller.getToken(req, res);
    }
    method(req, res, {
      GET: oauth
      ,POST: oauth
    });
  }
};


var rootPath = conf.serverRootPath || ''; // Just easier to use.
server.on('request', function (req, res) {
  var url = parseUrl(req.url)
  ,handlePath = (url.pathname.substr(0, rootPath.length) === rootPath)
  ,handled = 0;
  console.log(req.method+' '+req.url);
  console.dir(req.headers);
  if (handlePath) {
    var path = url.pathname.substr(rootPath.length);
    dispatch.match(path, handlers, function (handler, args) {
      if (handled++ === 0) {
        console.dir(arguments);
        handler.apply(this, args.concat([req, res]));
      } else {
        console.log('WARNING: "'+url.pathname+'" matched more than one handler.');
      }
    });
  }
  if (handled === 0) controller.notFound(req, res);
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');
