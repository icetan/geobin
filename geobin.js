var http = require('http')
,parseUrl = require('url').parse
,querystring = require('querystring')
,crypto = require('crypto')
,mongodb = require('mongodb')
,dispatch = require('./dispatch')
,ServeOAuth2 = require('./oauth2').ServeOAuth2;

var conf = {
  serverHost: '0.0.0.0'
  ,serverPort: 8124
  ,dbHost: '127.0.0.1'
  ,dbPort: 27017
  ,dbName: 'test'
  ,passwordKey: '7h3p4P1&m4Mi!'
  ,passwordSalt: '?fU7ur3_N4rw411z+'
  ,tokenKey: 'hFR<8~0zhNW,jx"\''
  ,tokenSalt: 'k!eW|b2tHC]TZI4\\'
}

,hashPassword = function (password) {
  return crypto.createHash('sha1', conf.passwordKey)
  .update(password).update(conf.passwordSalt).digest('base64');
}
,generateRandomBuffer = function (length) {
  var buf = new Buffer(length);
  for (var i = 0; i < length; i++) {
    buf[i] = Math.round(Math.random()*255);
  }
  return buf;
}
,encodeBase64Url = function (str) {
  return new Buffer(str).toString('base64')
  .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}
,decodeBase64Url = function (str) {
  return new Buffer(str.replace(/_/g, '/').replace(/-/g, '+'), 'base64').toString();
}
,generateRefreshToken = function () {
    return '1/'+encodeBase64Url(generateRandomBuffer(32));
}
,generateAccessToken = function () {
    return '1/'+encodeBase64Url(generateRandomBuffer(16));
}

,db = new mongodb.Db(conf.dbName
  ,new mongodb.Server(conf.dbHost, conf.dbPort)
  ,{native_parser: true})
,ObjectID = db.bson_serializer.ObjectID  
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
    ,date: parseInt(doc.date)
  };
}

,server = http.createServer()
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
,internalError = function (req, res, err) {
  console.log('500: '+req.method+' '+req.url+' internal server error: "'+err+'"');
  res.writeHead(500);
  res.end();
}
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
    methodNotAllowed(req, res);
  });
}
,textResponse = function (req, res, data) {
  res.writeHead(200, {
    //'Access-Control-Allow-Origin': '*'
    'Content-Type': 'text/plain'
  });
  res.end(data);
}
,jsonResponse = function (req, res, data) {
  if (data) {
    data = JSON.stringify(data);
    var query = parseUrl(req.url, true).query;
    if (query.jsonp && req.method === 'GET') {
      res.writeHead(200, {
        //'Access-Control-Allow-Origin': '*'
        'Content-Type': 'application/javascript'
      });
      data = query.jsonp+'('+data+');';
    } else {
      res.writeHead(200, {
        //'Access-Control-Allow-Origin': '*'
        'Content-Type': 'application/json'
      });
    }
  }
  res.end(data);
}

,oauth2 = new ServeOAuth2()
,oauthResource = function (req, res, username, scope, fn) {
  oauth2.authenticate(req, function (err, type, accessToken) {
    if (err) return badRequest(req, res, err);
    getCollection('token', function (err, collection) {
      if (err) return internalError(req, res, 'Persistance error.');
      var query = {
        username: username
        ,'access.token': accessToken
        ,'access.expires': {$gt:new Date()}
      };
      collection.find(query).nextObject(function (err, doc) {
        if (err) return internalError(req, res, 'Persistance error.');
        if (!doc) {
          if (type === 'query') type = 'Bearer';
          res.setHeader('WWW-Authenticate', type+' scope="'+scope+'"');
          return unauthorized(req, res, 'Access token not valid.');
        }
        fn(); // User has a valid access token, success!
      });
    });
  });
}

,handlers = {
  '^/geo/(.+)$': function (id, req, res) {
    method(req, res, {
      GET: function () {
        getCollection('location', function (err, collection) {
          console.log('DEBUG: Finding location ID: '+id);
          collection.find({_id:new ObjectID(id)}).nextObject(function (err, doc) {
            if (err) badRequest(req, res);
            if (doc) {
              jsonResponse(req, res, docToGeo(doc));
            } else {
              notFound(req, res);
            }
          });  
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
          doc.date = new Date();
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
        oauthResource(req, res, user, 'userInfo', function () {
          textResponse(req, res, 'Welcome to GeoBin '+user+'!');
        });
      }
    });
  }
  ,'^/user/(.+)/geo$': function (user, req, res) {
    method(req, res, {
      POST: function () {
        oauthResource(req, res, user, 'userInfo', function () {
          textResponse(req, res, 'Welcome to GeoBin '+user+'!');
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

oauth2.on('clientSecret', function (clientId, fn) {
  if (clientId === 'anonymous')
    fn(undefined, 'anonymous');
  else
    fn('Only support for anonymous clients for now.');
});
oauth2.on('authenticateUser', function (username, password, scope, fn) {
  getCollection('user', function (err, collection) {
    if (err) return fn('Persistance error.');
    var hash = hashPassword(password)
    ,query = {username:username, password:hash};
    collection.find(query).nextObject(function (err, doc) {
      if (err) return fn('Persistance error.');
      if (!doc) return fn('Invalid login.');
      fn(undefined, doc);
    });
  });
});
oauth2.on('refreshToken', function (clientId, credentials, fn) {
  console.log('DEBUG: Getting refresh token.');
  getCollection('token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var refreshToken = generateRefreshToken()
    ,query = {client:clientId, username:credentials.username}
    ,update = {$set:{refresh:{token:refreshToken}}};
    console.log('DEBUG: Generated refresh token: '+refreshToken);
    collection.update(query, update, {upsert:true, safe:true}, function (err) {
      if (err) return fn('Couldn\t persist refresh token.');
      console.log('DEBUG: Saved refresh token.');
      fn(undefined, refreshToken);
    });
  });
});
oauth2.on('authenticateRefreshToken', function (clientId, refreshToken, fn) {
  getCollection('token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var query = {client:clientId, refresh:{token:refreshToken}};
    collection.find(query).nextObject(function (err, doc) {
      if (err) return fn('Persistance error when retrieving refresh token.');
      if (!doc) return fn('Refresh token not valid.');
      fn(undefined, {username:doc.username});
    });
  });
});
oauth2.on('accessToken', function (clientId, credentials, scope, fn) {
  getCollection('token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var accessToken = generateAccessToken()
    ,expiresIn = 3600000 // One hour from now.
    ,query = {client:clientId, username:credentials.username}
    ,update = {$set:{access:{token:accessToken, expires:new Date(Date.now()+expiresIn)}}};
    collection.update(query, update, {upsert:true, safe:true}, function (err) {
      if (err) return fn('Couldn\t persist access token.');
      fn(undefined, accessToken, expiresIn);
    });
  });
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
