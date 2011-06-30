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
,getCollection = function (name, callback) {
  if (db.state === 'notConnected') {
    db.open(function (err, p_client) {
      db.collection(name, callback);
    });
  } else {
    db.collection(name, callback);
  }
}

,server = http.createServer()
,dispatch = {
  loc: function (url, req, callback) {
    ({
      GET: function () {
        getCollection('location', function (err, collection) {
          console.log('DEBUG: Finding location ID: '+url.parts[1]);
          collection.find({_id:new ObjectID(url.parts[1])}).nextObject(function (err, doc) {
            callback(err, doc);
          });
        });
      }
      ,POST: function () {
        var data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function() {
          console.log('DEBUG: Data from POST recived: '+data);
          try {
            var loc = JSON.parse(data);
            getCollection('location', function (err, collection) {
              collection.insert({
                loc: [loc.lon, loc.lat]
                ,data: {msg: loc.msg}
              }
              ,function (err, docs) {
                 callback(err); 
              });
            });
          } catch (err) {
            callback(err);
          }
        });
      }
    })[url.method]();
  }
};

server.on('request', function (req, res) {
  var url = parseUrl(req.url, true)
  ,handler = function (err, data) {
    if (err) {
      console.log('Error occured: '+err);
      res.writeHead(500);
      res.end();          
      return;
    }
    if (data) {
      data = JSON.stringify(data);
      if (url.query.jsonp) {
        res.setHeader('Content-Type', 'application/javascript');
        data = url.query.jsonp+'('+data+');';
      } else {
        res.setHeader('Content-Type', 'application/json');
      }
    }
    res.writeHead(200, {'Access-Control-Allow-Origin': '*'});
    res.end(data);
  };
  url.parts = url.pathname.split('/').splice(1);
  url.method = req.method.toUpperCase();

  console.log('DEBUG: Incoming request: '+JSON.stringify(url));
  try {
    if (url.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*'
        ,'Access-Control-Allow-Headers': 'X-Requested-With'
      });
      res.end();
    } else {
      dispatch[url.parts[0]](url, req, handler);
    }
  } catch (err) {
    handler(err);
  }
});

server.listen(conf.serverPort, conf.serverHost);
console.log('Server running at http://'+conf.serverHost+':'+conf.serverPort+'/');