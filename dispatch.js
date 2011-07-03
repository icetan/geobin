var reCache = {}
,match = function (str, handlers, res, fn) {
  if (typeof res === 'function') {
    fn = res;
    res = reCache; 
  }
  for (var i in handlers) {
    if (!res[i]) res[i] = new RegExp(i);
    var m = res[i].exec(str);
    if (m) {
      fn(handlers[i], m.splice(1));
    }
  }
};
exports.match = match;

var route = function (key, handlers, fn) {
  if (key in handlers) {
    handlers[key]();
  } else {
    fn();
  }
};
exports.route = route;

var Dispatch = function (handlers) {
  this.handlers = handlers;
  this.res = {};
}
Dispatch.prototype = {
  match: function (str, fn) {
    match(str, this.handlers, this.res, fn);
  }
  ,route: function (key, fn) {
    route(key, this.handlers, fn);
  }
};
exports.Dispatch = Dispatch;

