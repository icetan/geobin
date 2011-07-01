var http = require('http')
,parseUrl = require('url').parse
,mongodb = require('mongodb')
,oauth = require('./oauth')
,Dispatch = require('./dispatch').Dispatch;

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
,endChain = function (err, req, res, fn) {
  if (err) {
    console.log('Error occured: '+err);
    res.writeHead(500);
    res.end();
    return;
  }
  res.end();
  if (fn) fn(err, req, res);
}
,textChain = function (err, req, res, fn, data) {
  res.setHeader('Content-Type', 'text/plain');
  res.write(data);
  if (fn) fn(err, req, res);
}
,jsonChain = function (err, req, res, fn, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (data) {
    data = JSON.stringify(data);
    var query = parseUrl(req.url, true).query;
    if (query.jsonp && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/javascript');
      data = query.jsonp+'('+data+');';
    } else {
      res.setHeader('Content-Type', 'application/json');
    }
  }
  res.write(data);
  if (fn) fn(err, req, res);
}

,dispatch = new Dispatch({
  '^/geo/(.+)$': function (id, pathname, req, res) {
    ({
      GET: function () {
        getCollection('location', function (err, collection) {
          if (parts.length === 2) {
            console.log('DEBUG: Finding five latest geo\'s inserted');
            collection.find({}, {sort:['_id','desc'], limit:5}).toArray(function (err, docs) {
              var list = new Array(docs.length);
              for (var i = 0; i < docs.length; i++) list[i] = docToGeo(docs[i]); 
              jsonChain(err, req, res, endChain, list);
            });
          } else if (parts.length === 3) {
            console.log('DEBUG: Finding location ID: '+parts[2]);
            collection.find({_id:new ObjectID(parts[2])}).nextObject(function (err, doc) {
              jsonChain(err, req, res, endChain, docToGeo(doc));
            });
          }
        });
      }
    })[req.method]();
  }
  ,'^/geo$': function (pathname, req, res) {
    console.log(pathname+' '+req.method);
    ({
      GET: function () {
        getCollection('location', function (err, collection) {
          console.log('DEBUG: Finding five latest geo\'s inserted');
          collection.find({}, {sort:['_id','desc'], limit:5}).toArray(function (err, docs) {
            var list = new Array(docs.length);
            for (var i = 0; i < docs.length; i++) list[i] = docToGeo(docs[i]); 
            jsonChain(err, req, res, endChain, list);
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
              jsonChain(err, req, res, endChain, docToGeo(docs[0]));
            });
          });
        });
      }
    })[req.method];
  }

  ,'^/user/(.+)$': function (user, pathname, req, res) {
  }
  
  ,'^/oauth$': function (pathname, req, res) {
    ({
      GET: function () {
        var query = parseUrl(req.url, true).query
        ,signature = oauth.signature({
          httpMethod: req.method
          ,url: req.url
          ,params: query
          ,consumerSecret: 'anonymous'
          ,method: quety.oauth_signature_method
        });
        console.log('DEBUG: OAuth request signature is: ""'+query.oauth_signature
          +'", server signature is: "'+signature);
        var token = oauth.createRequestToken({
          nonce: query.oauth_nonce
          ,consumerSecret: 'anonymous'
          ,signature: query.oauth_signature
        });
        console.log('DEBUG: OAuth request token created: '+console.dir(token));
      }
    })[req.method]();
  }
});

server.on('request', function (req, res) {
  var url = parseUrl(req.url);
  console.log('DEBUG: Incoming '+req.method+' request: '+req.url);
//  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Access-Control-Allow-Headers': 'X-Requested-With'
      });
      res.end();
    } else {
      dispatch.route(url.pathname, function (fn) {
        fn(req, res);
      });
    }
//  } catch (err) {
//    endChain(err, req, res);
//  }
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');
