var http = require('http')
,parseUrl = require('url').parse
,querystring = require('querystring')
,mongodb = require('mongodb')
,oauth = require('./oauth')
,dispatch = require('./dispatch');

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
,notFound = function (req, res) {
  console.log('404: '+req.url+' not found.');
  res.writeHead(404);
  res.end();
}
,badRequest = function (req, res) {
  console.log('400: '+req.url+' bad request.');
  res.writeHead(400);
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

,handlers = {
  '^/geo/(.+)$': function (id, req, res) {
    ({
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
    })[req.method]();
  }
  ,'^/geo$': function (req, res) {
    ({
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
    })[req.method]();
  }

  ,'^/user/(.+)$': function (user, req, res) {
  }
  
  ,'^/token$': function (req, res) {
    method({
      POST: function () {
        var data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function() {
          querystring.parse(data);
        }
      }
    });
  }
//  ,'^/oauth$': function (req, res) {
//    ({
//      GET: function () {
//        var query = parseUrl(req.url, true).query
//        ,signature = oauth.signature({
//          httpMethod: req.method
//          ,url: req.url
//          ,params: query
//          ,consumerSecret: 'anonymous'
//          ,method: quety.oauth_signature_method
//        });
//        console.log('DEBUG: OAuth request signature is: ""'+query.oauth_signature
//          +'", server signature is: "'+signature);
//        var token = oauth.createRequestToken({
//          nonce: query.oauth_nonce
//          ,consumerSecret: 'anonymous'
//          ,signature: query.oauth_signature
//        });
//        console.log('DEBUG: OAuth request token created: '+console.dir(token));
//      }
//    })[req.method]();
//  }
};

server.on('request', function (req, res) {
  var url = parseUrl(req.url);
  console.log(req.method+' '+req.url);
  var handled = false;
  dispatch.match(url.pathname, handlers, function (handler, args) {
    handled = true;
    console.dir(arguments);
    handler.apply(this, args.concat([req, res]));
  });
  if (!handled) notFound(req, res);
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');
