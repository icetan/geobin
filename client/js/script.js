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
          geometry: {
            type: 'Point'
            ,coordinates: [position.coords.longitude, position.coords.latitude]
          }
          ,properties: {
            meta: {
              tag:['lol','rofl']
              ,text: 'Hej hej från webben.'
            }
          }
        })
        ,success: function () {
          alert("Success!");
        }
        ,error: function (xhr) {
          alert('Server error: '+xhr.statusText);
        }
      });
    });
  });
})(jQuery);
