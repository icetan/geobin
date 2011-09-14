(function($) {
  var geolocation = function (fn) {
    navigator.geolocation.getCurrentPosition(fn, function (error) {
      alert('Error when retrieving location "'+error.message+'".');
    });
  };
  $('.send-position').click(function () {
    geolocation(function (position) {
      $.ajax({
        type: 'POST'
        ,dataType: 'json'
        ,url: 'http://localhost:8124/geo'
        ,data: JSON.stringify({
          lon: position.coords.longitude
          ,lat: position.coords.latitude
          ,msg: 'Hej hej från webben.'
        })
        ,success: function () {}
        ,error: function () {}
      });
    });
  });
})(jQuery);
