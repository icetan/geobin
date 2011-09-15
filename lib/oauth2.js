var url = require('url')
,querystring = require('querystring')
,dispatch = require('./dispatch')
,EventEmitter = require('events').EventEmitter;

var authenticateBasic = function (headers, username, password) {
  var b64 = new Buffer(username.replace(/:/g, '')+':'+password).toString('base64');
  return headers['authorization'] === 'Basic '+b64;
};

function ServeOAuth2 () {};
exports.ServeOAuth2 = ServeOAuth2;
ServeOAuth2.prototype = new EventEmitter;

ServeOAuth2.prototype._response = function (data, req, res) {
  var headers = {
    'Content-Type': 'application/json'
    ,'Cache-Control': 'no-store'
  };
  for (var key in data.headers) {
    headers[key] = data.headers[key];
  }
  res.writeHead(data.statusCode, headers);
  res.end(data.response ? JSON.stringify(data.response) : undefined);
};

ServeOAuth2.prototype._getClientSecret = function (clientId, fn) {
  this.emit('clientSecret'
  ,clientId
  ,function (err, clientSecret) {
    if (err) {
      return fn({
        statusCode: 401
        ,response: {
          error: 'invalid_client'
          ,error_description: 'Invalid client: "'+err+'".'
        }
      });
    }
    fn(undefined, clientSecret);
  });
};

ServeOAuth2.prototype._getAccessToken = function (params, credentials, fn) {
  this.emit('accessToken'
  ,params.client_id
  ,credentials
  ,function (err, accessToken, expiration) {
    if (err) {
      return fn({
        statusCode: 500
        ,response: {
          error: '500'
          ,error_description: 'Couldn\'t generate access token: "'+err+'".'
        }
      })
    }
    fn({
      statusCode: 200
      ,response: {
        access_token: accessToken
        ,token_type: 'example'
        ,expires_in: expiration
      }
    });
  });
};

ServeOAuth2.prototype.authenticateClient = function (headers, params, fn) {
  console.log('DEBUG: authenticating client:');
  console.dir(headers);
  console.dir(params);
  var self = this
  ,type = 'unknown';
  if ('authorization' in headers) {
    var authHeader = headers['authorization'].split(' ');
    type = authHeader[0];
  } else if ('client_secret' in params) {
    type = 'query';
  }
  dispatch.route(type, {
    'Basic': function () {
      self._getClientSecret(params.client_id
      ,function (err, clientSecret) {
        if (err)
          return fn(err);
        if (!authenticateBasic(headers, params.client_id, clientSecret)) {
          return fn({
            statusCode: 401
            ,headers: {
              'WWW-Authenticate': 'Basic realm="Client Authentication"'
            }
            ,response: {
              error: 'invalid_client'
              ,error_description: 'Client secret doesn\'t match.'
            }
          });
        }
        fn(); // Everything went better than expected.
      });
    },
    'query': function () {
      self._getClientSecret(params.client_id
      ,function (err, clientSecret) {
        if (err)
          return fn(err);
        if (pararms.client_secret !== clientSecret) {
          return fn({
            statusCode: 400
            ,response: {
              error: 'invalid_client'
              ,error_description: 'Client secret doesn\'t match.'
            }
          });
        }
        fn(); // Everything went better than expected.
      });
    }
  }
  ,function(fn) {
    fn();
  }
  ,function () {
    fn({
      statusCode: 401
      ,response: {
        error: 'invalid_client'
        ,error_description: 'Unsupported credentials type "'+type+'" is not supported.'
      }
    });
  });
};

ServeOAuth2.prototype.serveAccessToken = function (params, fn) {
  console.log('DEBUG: ServeOAuth2 is serving a access token:');
  console.dir(params);
  var self = this;
  dispatch.route(params.grant_type, {
    'password': function () {
      console.log('DEBUG: ServeOAuth2 is trying to authenticate user.');
      self.emit('authenticateUser'
      ,params.username
      ,params.password
      ,params.scope
      ,function (err, credentials) {
        if (err) {
          return fn({
            statusCode: 400
            ,response: {
              error: 'invalid_grant'
              ,error_description: err
            }
          });
        }
        console.log('DEBUG: ServeOAuth2 is trying to get a refresh token.');
        self.emit('refreshToken'
        ,params.client_id
        ,credentials
        ,function (err, refreshToken) {
          if (err) {
            return fn({
              statusCode: 400
              ,response: {
                error: 'invalid_grant'
                ,error_description: err
              }
            });
          }
          console.log('DEBUG: ServeOAuth2 is trying to get a access token.');
          self._getAccessToken(params, credentials, function (data) {
            if (data.statusCode === 200) data.response['refresh_token'] = refreshToken;
            fn(data);
          });
        });
      });
    }
    ,'refresh_token': function () {
      self.emit('authenticateRefreshToken'
      ,params.client_id
      ,params.refresh_token
      ,function (err, credentials, refreshToken) {
        if (err) {
          return fn({
            statusCode: 400
            ,response: {
              error: 'invalid_grant'
              ,error_description: err
            }
          });
        }  
        self._getAccessToken(params, credentials, function (data) {
          if (data.statusCode === 200) data.response['refresh_token'] = refreshToken;
          fn(data);
        });
      });
    }
  }
  ,function (handler) {
    handler();
  }
  ,function () {
    fn({
      statusCode: 400
      ,response: {
        error: 'unsupported_grant_type'
        ,error_description: 'Grant type "'+params.grant_type+'" is not supported.'
          +' Supported types are: "password" and "refresh_token".'
      }
    });
  });
};

ServeOAuth2.prototype.authorize = function (req, res) {
  var self = this
  ,respond = function (data) {
    self._response(data, req, res);
  };
  dispatch.route(req.method, {
    'POST': function () {
      if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
        return respond({
          statusCode: 400
          ,response: {
            error: 'invalid_request'
            ,error_description: 'Content-Type "'
              +req.headers['content-type']
              +'" not supported. Supported MIME-types are: "application/x-www-form-urlencoded".'
          }
        });
      }
      var data = '';
      req.on('data', function (chunk) {data += chunk;});
      req.on('end', function () {
        console.log('DEBUG: ServeOAuth2 received POST with data: '+data);
        var params = querystring.parse(data);
        self.authenticateClient(req.headers 
        ,params
        ,function (err) {
          if (err) return respond(err);
          self.serveAccessToken(params, respond);
        });
      });
    }
    ,'GET': function () {
      var params = url.parse(req.url, true).query;
      self.authenticateClient(req.headers
      ,params
      ,function (err) {
        if (err) return respond(err);
        self.serveAccessToken(params, respond);
      });
    }
  }
  ,function (handler) {
    handler();
  }
  ,function () {
    respond({
      statusCode: 400
      ,response: {
        error: 'invalid_request'
        ,error_description: 'Request method "'+req.method+'" not supported'
      }
    });
  });
};

ServeOAuth2.prototype.authenticate = function (req, fn) {
  var self = this
  ,type = 'unknown'
  ,value;
  if ('authorization' in req.headers) {
    var authHeader = req.headers['authorization'];
    type = authHeader.substr(0,authHeader.indexOf(' '))
    value = authHeader.substr(authHeader.indexOf(' ')+1);
  } else {
    var query = url.parse(req.url, true).query;
    if ('access_token' in query) {
      type = 'query';
      value = query.access_token;
    }
  }
  dispatch.route(type, {
    'Bearer': function () {
      fn(undefined, type, value);
    },
    'query': function () {
      fn(undefined, type, value);
    }
  }
  ,function () {
    handler();
  }
  ,function () {
    fn('Access token type "'+type+'" is not supported.');
  });
}
