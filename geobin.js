var http = require('http')
,parseUrl = require('url').parse
,querystring = require('querystring')
,mongodb = require('mongodb')
,dispatch = require('./dispatch')
,ServeOAuth2 = require('./oauth2').ServeOAuth2;

var conf = {
  serverHost: '0.0.0.0'
  ,serverPort: 8124
  ,dbHost: '127.0.0.1'
  ,dbPort: 27017
  ,dbName: 'test'
}

,db = new mongodb.Db(conf.dbName
  ,new mongodb.Server(conf.dbHost, conf.dbPort)
  ,{native_parser: true})
,ObjectID = db.bson_serializer.ObjectID  
,Timestamp = db.bson_serializer.Timestamp
,getCollection = function (name, fn) {
  if (db.state === 'notConnected') {
    db.open(function (err, p_client) {
      db.collection(name, fn);
    });
  } else {
    db.collection(name, fn);
  }
}

,geoToDoc = function (geo) {
  if (typeof geo.category !== 'string') throw 'geo.category must be a string';
  if (typeof geo.msg !== 'string') throw 'geo.msg must be a string';
  return {
    loc: [geo.lon, geo.lat]
    ,category: geo.category
    ,data: {msg: geo.msg}
  };
}
,docToGeo = function (doc) {
  return {
    id: doc._id
    ,lon: doc.loc[0]
    ,lat: doc.loc[1]
    ,msg: doc.data.msg
    ,category: doc.category
    ,timestamp: parseInt(doc.timestamp)
  };
}

,server = http.createServer()
,parsePathname = function(req) {
  return parseUrl(req.url).pathname.split('/').splice(1);
}
,ok = function (req, res) {
  res.writeHead(200);
  res.end();
}
,badRequest = function (req, res, text) {
  console.log('400: '+req.url+' bad request.');
  res.writeHead(400, {'Content-Type': 'text/plain'});
  res.end(text);
}
,unauthorized = function (req, res, text) {
  console.log('401: '+req.url+' unauthorized.');
  res.writeHead(401, {'Content-Type': 'text/plain'});
  res.end(text);
}
,notFound = function (req, res) {
  console.log('404: '+req.url+' not found.');
  res.writeHead(404);
  res.end();
}
,methodNotAllowed = function (req, res) {
  console.log('405: '+req.method+' '+req.url+' method not allowed.');
  res.writeHead(405);
  res.end();
}
,method = function (req, res, handlers) {
  if (!handlers['OPTIONS']) {
    handlers['OPTIONS'] = function () {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Access-Control-Allow-Headers': 'X-Requested-With'
      });
      res.end();
    };
  }
  dispatch.route(req.method, handlers, function () {
    methodNotAllowed(req, res);
  });
}
,textResponse = function (req, res, data) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*'
    ,'Content-Type': 'text/plain'
  });
  res.end(data);
}
,jsonResponse = function (req, res, data) {
  if (data) {
    data = JSON.stringify(data);
    var query = parseUrl(req.url, true).query;
    if (query.jsonp && req.method === 'GET') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Content-Type': 'application/javascript'
      });
      data = query.jsonp+'('+data+');';
    } else {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Content-Type': 'application/json'
      });
    }
  }
  res.end(data);
}

,oauth2 = new ServeOAuth2()

,handlers = {
  '^/geo/(.+)$': function (id, req, res) {
    method(req, res, {
      GET: function () {
        getCollection('location', function (err, collection) {
          console.log('DEBUG: Finding location ID: '+id);
          try {
            collection.find({_id:new ObjectID(id)}).nextObject(function (err, doc) {
              if (doc) {
                jsonResponse(req, res, docToGeo(doc));
              } else {
                notFound(req, res);
              }
            });  
          } catch (err) {
            badRequest(req, res);
          }
        });
      }
    });
  }
  ,'^/geo$': function (req, res) {
    method(req, res, {
      GET: function () {
        getCollection('location', function (err, collection) {
          console.log('DEBUG: Finding five latest geo\'s inserted');
          collection.find({}, {sort:['_id','desc'], limit:5}).toArray(function (err, docs) {
            var list = new Array(docs.length);
            for (var i = 0; i < docs.length; i++) list[i] = docToGeo(docs[i]); 
            jsonResponse(req, res, list);
          });
        });
      }
      ,POST: function () {
        var data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function() {
          console.log('DEBUG: Data from POST recived: '+data);
          var doc = geoToDoc(JSON.parse(data));
          doc.timestamp = new Timestamp(Date.now());
          console.log('DEBUG: Inserting into database:');
          console.dir(doc);
          getCollection('location', function (err, collection) {
            collection.insert(doc, function (err, docs) {
              jsonResponse(req, res, docToGeo(docs[0]));
            });
          });
        });
      }
    });
  }

  ,'^/user/(.+)$': function (user, req, res) {
    method(req, res, {
      GET: function () {
        oauth2.authenticate(req, function (err, type, accessToken) {
          if (err) return badRequest(req, res, err);
          if (accessToken !== '4cc355Tok3n') {
            if (type === 'query') {
              badRequest(req, res, 'Access token not valid.');
            } else {
              res.setHeader('WWW-Authenticate', type+' realm="User info"');
              unauthorized(req, res, 'Access token not valid.');
            }
          } else {
            // Success, user authenticated with a access token!
            textResponse(req, res, 'Welcome to GeoBin '+user+'!');
          }
        });
      }
    });
  }
  
  ,'^/token$': function (req, res) {
    var oauth = function () {
      oauth2.authorize(req, res);
    }
    method(req, res, {
      GET: oauth
      ,POST: oauth
    });
  }
};

oauth2.on('clientSecret', function(clientId, fn) {
  if (clientId === 'anonymous')
    fn(undefined, 'anonymous');
  else
    fn('Only support for anonymous clients for now.');
});
oauth2.on('authenticateUser', function(username, password, scope, fn) {
  if (username === 'test' && password === 'test123')
    fn();
  else
    fn('Invalid login');
});
oauth2.on('refreshToken', function(clientId, username, fn) {
  fn(undefined, 'r3fr35hT0k3n');
});
oauth2.on('authenticateRefreshToken', function(clientId, username, refreshToken, fn) {
  if (refreshToken === 'r3fr35hT0k3n') {
    fn(undefined, 'r3fr35hT0k3n'); // Generate new refresh token if needed.
  } else {
    fn('Invalid refresh token.');
  }
});
oauth2.on('accessToken', function(clientId, username, scope, fn) {
  fn(undefined, '4cc355Tok3n', 3600);
});

server.on('request', function (req, res) {
  var url = parseUrl(req.url);
  console.log(req.method+' '+req.url);
  console.dir(req.headers);
  var handled = 0;
  dispatch.match(url.pathname, handlers, function (handler, args) {
    if (handled++ === 0) {
      console.dir(arguments);
      handler.apply(this, args.concat([req, res]));
    } else {
      console.log('WARNING: "'+url.pathname+'" matched more than one handler.');
    }
  });
  if (handled === 0) notFound(req, res);
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');
