var button = $('#followButton');
var following = false;

button.click(function() {
  following = !following;

  if (following) {
    button.html('UNFOLLOW');
    button.removeClass('btn-success').addClass('btn-danger');
  } else {
    button.html('FOLLOW ME');
    button.removeClass('btn-danger').addClass('btn-success');
  }

  var msg = {
    type: 'follow',
    body: following
  };

  ws.send(JSON.stringify(msg));
});

var ws = null;
var connected = false;

function connectWs() {
  ws = new WebSocket("ws://"+location.host);
  ws.onclose = () => {
    console.log('ws onopen');
  };
  ws.onopen = () => {
    console.log('ws onopen');
    connected = true;
  };
  ws.onmessage = (message) => {
    console.log('ws onmessage')
  };
}

connectWs();