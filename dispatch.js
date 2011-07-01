var Dispatch = function (handlers) {
  this.handlers = {};
  this.res = {};
  this.add(handlers);
}
Dispatch.prototype = {
  add: function (handlers) {
    for (var i in handlers) {
      this.res[i] = new RegExp(i);
      this.handlers[i] = handlers[i];
    }
  }
  ,route: function (str, fn) {
    for (var i in this.res) {
      var m = this.res[i].exec(str);
      if (m) {
        var args = m.splice(1);
        args.push(str);
        fn((function (handler, args) {
          return function () {
            for (var i in arguments) args.push(arguments[i]);
              handler.apply(this, args);
            }
          })(this.handlers[i], args));
        return true;
      }
    }
    return false;
  }
}
exports.Dispatch = Dispatch;
