var http = require('http')
,parseUrl = require('url').parse
,mongodb = require('mongodb')
,ObjectID = mongodb.ObjectID
,oauth = require('./oauth');

var conf = {
  serverHost: '0.0.0.0'
  ,serverPort: 8124
  ,dbHost: '127.0.0.1'
  ,dbPort: 27017
}

,db = new mongodb.Db('test'
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
  return {
    loc: [geo.lon, geo.lat]
    ,cat: geo.category
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
  };
}

,server = http.createServer()
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
,dispatch = {
  geo: function (req, res) {
    ({
      GET: function () {
        getCollection('location', function (err, collection) {
          var parts = parseUrl(req.url).pathname.split('/');
          console.log('DEBUG: Finding location ID: '+parts[2]);
          collection.find({_id:new ObjectID(parts[2])}).nextObject(function (err, doc) {
            jsonChain(err, req, res, endChain, docToGeo(doc));
          });
        });
      }
      ,POST: function () {
        var data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function() {
          console.log('DEBUG: Data from POST recived: '+data);
          var doc = geoToDoc(JSON.parse(data));
          console.log('DEBUG: Inserting into database:');
          console.dir(doc);
          getCollection('location', function (err, collection) {
            collection.insert(doc, function (err, docs) {
              jsonChain(err, req, res, endChain, docToGeo(docs[0]));
            });
          });
        });
      }
    })[req.method]();
  }
  
  ,oauth: function (req, res) {
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
};

server.on('request', function (req, res) {
  var parts = parseUrl(req.url).pathname.split('/');
  console.log('DEBUG: Incoming '+req.method+' request: '+req.url);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Access-Control-Allow-Headers': 'X-Requested-With'
      });
      res.end();
    } else {
      dispatch[parts[1]](req, res);
    }
  } catch (err) {
    endChain(err, req, res);
  }
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');