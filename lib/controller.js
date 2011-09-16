var mongodb = require('mongodb')
,_ = require('underscore')
,parseUrl = require('url').parse
,ServeOAuth2 = require('./oauth2').ServeOAuth2
,model = require('./model.js')
,util = require('./util')
,conf = require('./config');


// Setup and helpers
var createDb = function (withNative) {
  try {
    return new mongodb.Db(conf.dbName
      ,new mongodb.Server(conf.dbHost, conf.dbPort)
      ,{native_parser: withNative});
  } catch (err) {
    if (withNative) return createDb(false);
    else throw err;
  }
}
,db = createDb(true)
,ObjectID = db.bson_serializer.ObjectID
,Binary = db.bson_serializer.Binary
,getCollection = function (name, fn) {
  if (db.state === 'notConnected') {
    db.open(function (err, p_client) {
      db.collection(name, fn);
    });
  } else {
    db.collection(name, fn);
  }
}
,ok = 
exports.ok = function (req, res) {
  res.writeHead(200, conf.headers);
  res.end();
}
,okCors = 
exports.okCors = function (req, res) {
  res.writeHead(200, _.extend({
    'Access-Control-Allow-Headers': 'X-Requested-With'
  }, conf.headers));
  res.end();
}
,badRequest = function (req, res, text) {
  console.log('400: '+req.url+' bad request.');
  res.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end(text);
}
,unauthorized = function (req, res, text) {
  console.log('401: '+req.url+' unauthorized.');
  res.writeHead(401, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end(text);
}
,notFound = 
exports.notFound = function (req, res) {
  console.log('404: '+req.url+' not found.');
  res.writeHead(404);
  res.end();
}
,methodNotAllowed = 
exports.methodNotAllowed = function (req, res) {
  console.log('405: '+req.method+' '+req.url+' method not allowed.');
  res.writeHead(405);
  res.end();
}
,internalError = function (req, res, err) {
  console.log('500: '+req.method+' '+req.url+' internal server error: "'+err+'"');
  res.writeHead(500);
  res.end();
}
,textResponse = function (req, res, data) {
  res.writeHead(200, _.extend({
    'Content-Type': 'text/plain; charset=utf-8'
  }, conf.headers));
  res.end(data);
}
,jsonResponse = function (req, res, data) {
  if (data) {
    data = JSON.stringify(data);
    console.log('DEBUG: JSON response '+data);
    var query = parseUrl(req.url, true).query;
    if (query.jsonp && req.method === 'GET') {
      res.writeHead(200, _.extend({
        'Content-Type': 'application/javascript; charset=utf-8'
      }, conf.headers));
      data = query.jsonp+'('+data+');';
    } else {
      res.writeHead(200, _.extend({
        'Content-Type': 'application/json; charset=utf-8'
      }, conf.headers));
    }
  }
  res.end(data);
}
,oauth2 = new ServeOAuth2()
,oauthResource = function (req, res, username, scope, fn) {
  oauth2.authenticate(req, function (err, type, accessToken) {
    if (err) return badRequest(req, res, err);
    getCollection('access_token', function (err, collection) {
      if (err) return internalError(req, res, 'Persistance error.');
      var query = {
        username: username
        ,token: accessToken
        ,expires: {$gt:new Date()}
      };
      console.log('DEBUG: Authentication access to resource "'+scope+'":');
      console.dir(query);
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
};

// OAuth 2.0 coupling
oauth2.on('clientSecret', function (clientId, fn) {
  if (clientId === 'anonymous')
    fn(undefined, 'anonymous');
  else
    fn('Only support for anonymous clients for now.');
});
oauth2.on('authenticateUser', function (username, password, scope, fn) {
  getCollection('user', function (err, collection) {
    if (err) return fn('Persistance error.');
    var hash = util.hashPassword(password)
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
  getCollection('refresh_token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var refreshToken = util.generateRefreshToken()
    ,query = {client:clientId, username:credentials.username}
    ,update = {$set:{token:refreshToken}};
    console.log('DEBUG: Generated refresh token: '+refreshToken);
    collection.update(query, update, {upsert:true, safe:true}, function (err) {
      if (err) return fn('Couldn\t persist refresh token.');
      console.log('DEBUG: Saved refresh token.');
      fn(undefined, refreshToken);
    });
  });
});
oauth2.on('authenticateRefreshToken', function (clientId, refreshToken, fn) {
  getCollection('refresh_token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var query = {client:clientId, token:refreshToken};
    collection.find(query).nextObject(function (err, doc) {
      if (err) return fn('Persistance error when retrieving refresh token.');
      if (!doc) return fn('Refresh token not valid.');
      fn(undefined, {username:doc.username});
    });
  });
});
oauth2.on('accessToken', function (clientId, credentials, fn) {
  getCollection('access_token', function (err, collection) {
    if (err) return fn('Persistance error.');
    var accessToken = util.generateAccessToken()
    ,expiresIn = 3600000 // One hour.
    ,query = {client:clientId, username:credentials.username}
    ,update = {$set:{token:accessToken, expires:new Date(Date.now()+expiresIn)}};
    collection.update(query, update, {upsert:true, safe:true}, function (err) {
      if (err) return fn('Couldn\'t persist access token.');
      fn(undefined, accessToken, expiresIn);
    });
  });
});



// Controller functions
var getAnonymousGeo = 
exports.getAnonymousGeo = function (req, res, id) {
  getCollection('location', function (err, collection) {
    console.log('DEBUG: Finding location ID: '+id);
    collection.find({_id:new ObjectID(id)}).nextObject(function (err, doc) {
      if (err) badRequest(req, res);
      if (doc) {
        jsonResponse(req, res, model.docToGeo(doc));
      } else {
        notFound(req, res);
      }
    });  
  });
}

,listAnonymousGeo = 
exports.listAnonymousGeo = function (req, res) {
  getCollection('location', function (err, collection) {
    console.log('DEBUG: Finding five latest geo\'s inserted');
    collection.find({}, {sort:['_id','desc'], limit:5}).toArray(function (err, docs) {
      if (err) internalError(req, res, err);
      var list = new Array(docs.length);
      for (var i = 0; i < docs.length; i++) list[i] = model.docToGeo(docs[i]); 
      jsonResponse(req, res, list);
    });
  });
}

,saveAnonymousGeo = 
exports.saveAnonymousGeo = function (req, res) {
  var data = '';
  req.on('data', function (chunk) { data += chunk; });
  req.on('end', function() {
    console.log('DEBUG: Data from POST recived: '+data);
    var doc = model.geoToDoc(JSON.parse(data));
    doc.date = new Date();
    console.log('DEBUG: Inserting into database:');
    console.dir(doc);
    getCollection('location', function (err, collection) {
      collection.insert(doc, function (err, docs) {
        jsonResponse(req, res, model.docToGeo(docs[0]));
      });
    });
  });
}

,getUser = 
exports.getUser = function (req, res, username) {
  oauthResource(req, res, username, 'userInfo', function () {
    textResponse(req, res, 'Welcome to GeoBin '+username+'!');
  });
}

,listGeo = 
exports.listGeo = function (req, res, username) {
  oauthResource(req, res, username, 'getGeo', function () {
    getCollection('location', function (err, collection) {
      console.log('DEBUG: Finding five latest geo\'s inserted for user '+username);
      collection.find({username:username}
      ,{sort:['_id','desc'], limit:5}).toArray(function (err, docs) {
        var list = new Array(docs.length);
        for (var i = 0; i < docs.length; i++) list[i] = model.docToGeo(docs[i]); 
        jsonResponse(req, res, list);
      });
    });
  });
}

,saveGeo = 
exports.saveGeo = function (req, res, username) {
  oauthResource(req, res, username, 'postGeo', function () {
    var data = '';
    req.on('data', function (chunk) { data += chunk; });
    req.on('end', function() {
      console.log('DEBUG: Data from POST recived: '+data);
      var doc = model.geoToDoc(JSON.parse(data));
      doc.date = new Date();
      doc.username = username;
      console.log('DEBUG: Inserting geo into database for '+username+':');
      console.dir(doc);
      getCollection('location', function (err, collection) {
        collection.insert(doc, function (err, docs) {
          jsonResponse(req, res, model.docToGeo(docs[0]));
        });
      });
    });
  });
}

,getToken = 
exports.getToken = function (req, res) {
  oauth2.authorize(req, res);
};

