var reCache = {}
,route = function (str, handlers, res, fn) {
  if (typeof res === 'function') {
    fn = res;
    res = reCache; 
  }
  for (var i in handlers) {
    if (!res[i]) res[i] = new RegExp(i);
    var m = res[i].exec(str);
    if (m) {
      fn.call(this, handlers[i], m.splice(1));
    }
  }
}

var Dispatch = function (handlers) {
  this.handlers = handlers;
  this.res = {};
}
Dispatch.prototype = {
  route: function (str, fn) {
    route(str, this.handlers, this.res, fn);
  }
};

exports.route = route;
exports.Dispatch = Dispatch;
